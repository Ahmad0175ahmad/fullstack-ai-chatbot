from typing import Annotated, TypedDict
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, RemoveMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_community.tools import DuckDuckGoSearchRun
import db
import uuid

# --- 1. Tools ---
@tool
def save_user_preference(user_id: str, fact: str):
    """Call this ONLY to save NEW personal preferences, details, or facts about the user."""
    is_new = db.save_ltm(user_id, fact)
    return f"Saved new fact: '{fact}'." if is_new else f"Fact '{fact}' was already known."

@tool
def calculator(expression: str) -> str:
    """Evaluates mathematical expressions."""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"Error: {e}"

web_search = DuckDuckGoSearchRun(name="web_search", description="Search the web for current events or facts.")

tools = [save_user_preference, calculator, web_search]
tools_by_name = {t.name: t for t in tools}
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7).bind_tools(tools)

# --- 2. Production State (with Summary) ---
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    summary: str # Holds the running summary of old messages

# --- 3. Nodes ---
def call_model(state: AgentState):
    # If a summary exists, inject it into the conversation flow natively
    summary = state.get("summary", "")
    if summary:
        sys_message = SystemMessage(content=f"Summary of earlier conversation: {summary}")
        messages = [sys_message] + state["messages"]
    else:
        messages = state["messages"]
        
    response = llm.invoke(messages)
    return {"messages": [response]}

def execute_tools(state: AgentState):
    last_message = state["messages"][-1]
    tool_responses = []
    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        print(f"🤖 [TOOL CALLED] -> {tool_name}")
        if tool_name in tools_by_name:
            result = tools_by_name[tool_name].invoke(tool_call["args"])
            tool_responses.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))
    return {"messages": tool_responses}

def summarize_conversation(state: AgentState):
    """Summarizes old messages and deletes them from the context window."""
    summary = state.get("summary", "")
    messages = state["messages"]
    
    # We will summarize everything EXCEPT the last 4 messages (keep recent context fresh)
    messages_to_summarize = messages[:-4]
    
    summary_prompt = (
        f"This is the summary of the conversation so far: {summary}\n\n"
        "Extend the summary by taking into account the new messages above."
    ) if summary else "Create a concise summary of the conversation above."
    
    # Ask LLM to generate summary
    messages_for_llm = messages_to_summarize + [HumanMessage(content=summary_prompt)]
    response = ChatOpenAI(model="gpt-4o-mini", temperature=0).invoke(messages_for_llm)
    
    # Delete the old messages from LangGraph's state to free up tokens
    delete_messages = [RemoveMessage(id=m.id) for m in messages_to_summarize]
    
    print(f"🧹 [MEMORY CLEANUP] Summarized {len(messages_to_summarize)} old messages.")
    return {"summary": response.content, "messages": delete_messages}

# --- 4. Routing Logic ---
def should_continue(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    
    if last_message.tool_calls:
        return "tools"
    
    # Trigger summarization if the conversation gets longer than 6 messages
    if len(messages) > 6:
        return "summarize"
        
    return END

# --- 5. Build Graph (Without Checkpointer yet) ---
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.add_node("tools", execute_tools)
workflow.add_node("summarize", summarize_conversation)

workflow.add_edge(START, "agent")
workflow.add_conditional_edges("agent", should_continue, ["tools", "summarize", END])
workflow.add_edge("tools", "agent")
workflow.add_edge("summarize", END)

# We export the workflow, but we will compile it in main.py where the DB pool lives