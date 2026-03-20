from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import contextlib
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.checkpoint.postgres import PostgresSaver
import db
import agent
from fastapi.middleware.cors import CORSMiddleware
# Global variable to hold our compiled graph
app_graph = None

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global app_graph
    # 1. Initialize our custom LTM table
    db.init_db()
    
    # 2. Setup LangGraph's internal Postgres tables for STM and State
    # FIX: We remove the 'with' block and just instantiate it directly using our pool
    checkpointer = PostgresSaver(db.pool)
    checkpointer.setup() # Automatically creates necessary checkpoint tables in Postgres
    app_graph = agent.workflow.compile(checkpointer=checkpointer)
    
    yield # The FastAPI server runs while paused here
    
    # Shutdown logic
    db.pool.close()

app = FastAPI(title="Production Chatbot", lifespan=lifespan)
# <--- 2. ADD THIS ENTIRE BLOCK --->
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows your React app to send requests
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class ChatRequest(BaseModel):
    user_id: str
    conversation_id: str | None = None
    message: str

@app.post("/chat")
def chat(request: ChatRequest):
    conv_id = request.conversation_id or str(uuid.uuid4())
    
    # 1. Get Long Term Memory Context
    ltm_facts = db.get_ltm(request.user_id)
    
    # UPDATE THIS IN main.py (Inside your chat endpoint)
    system_prompt = (
        f"You are a helpful, highly precise, and concise AI assistant. "
        f"The current user's ID is '{request.user_id}'. "
        "CRITICAL INSTRUCTIONS:\n"
        "1. Keep your answers brief and direct. Do not give long, detailed explanations unless the user explicitly asks for 'details', 'more info', or 'explain in depth'.\n"
        "2. If the user tells you a NEW personal preference or fact, you MUST use the 'save_user_preference' tool."
    )
    if ltm_facts:
        system_prompt += f"\nKNOWN FACTS ABOUT USER (DO NOT re-save these): {', '.join(ltm_facts)}. "
    
    # 2. We ONLY need to pass the newest message. LangGraph fetches the rest from Postgres!
    # We assign an ID to the human message so the checkpointer can delete it later if summarized
    new_message = HumanMessage(content=request.message, id=str(uuid.uuid4()))
    
    messages = [SystemMessage(content=system_prompt), new_message]
    
    # 3. Invoke Graph with Thread ID Configuration
    config = {"configurable": {"thread_id": conv_id}}
    
    final_state = app_graph.invoke(
        {"messages": messages}, 
        config=config
    )
    
    ai_response = final_state["messages"][-1].content
    
    return {
        "conversation_id": conv_id,
        "response": ai_response
    }

@app.delete("/conversations/{conversation_id}")
def delete_chat(conversation_id: str):
    """Deletes all memory of a specific conversation from LangGraph's tables."""
    try:
        with db.pool.connection() as conn:
            # Delete the thread data from LangGraph's internal tables
            conn.execute("DELETE FROM checkpoints WHERE thread_id = %s", (conversation_id,))
            conn.execute("DELETE FROM checkpoint_blobs WHERE thread_id = %s", (conversation_id,))
            conn.execute("DELETE FROM checkpoint_writes WHERE thread_id = %s", (conversation_id,))
            
        return {"status": "success", "message": f"Conversation {conversation_id} deleted."}
    except Exception as e:
        print(f"Error deleting conversation: {e}")
        # Return a 500 error if something goes wrong with the DB
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Failed to delete conversation from database.")
