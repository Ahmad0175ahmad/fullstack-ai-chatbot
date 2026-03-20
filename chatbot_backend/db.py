import os
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv

load_dotenv()

# Connection pool for production-grade database handling
pool = ConnectionPool(
    conninfo=os.getenv("DATABASE_URL"),
    max_size=10, 
    kwargs={"prepare_threshold": None} # Fixes the Render/Supabase crash!
)

def init_db():
    """Initializes only the Long Term Memory table. LangGraph handles the rest."""
    with pool.connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS long_term_memory (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                fact TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

# --- LTM Functions ---

def get_ltm(user_id: str):
    """Retrieves all saved facts for a specific user."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT fact FROM long_term_memory WHERE user_id = %s", (user_id,))
            memories = cur.fetchall()
            # MAGIC FIX: Uses m[0] because Postgres returns Tuples, not Dictionaries
            return [m[0] for m in memories]

def save_ltm(user_id: str, fact: str):
    """Saves a new fact if it doesn't already exist."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch existing memories to check for duplicates
            cur.execute("SELECT fact FROM long_term_memory WHERE user_id = %s", (user_id,))
            existing_memories = cur.fetchall()
            
            # 2. Check against duplicates (also using m[0] here to prevent the Tuple error!)
            for memory in existing_memories:
                existing_fact = memory[0].lower()
                new_fact = fact.lower()
                if new_fact in existing_fact or existing_fact in new_fact:
                    print(f"⚠️ Duplicate fact prevented: '{fact}' is already saved.")
                    return False

            # 3. Insert the new fact
            cur.execute(
                "INSERT INTO long_term_memory (user_id, fact) VALUES (%s, %s)", 
                (user_id, fact)
            )
            return True