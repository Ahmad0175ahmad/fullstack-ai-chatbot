import os
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

# Connection pool for production-grade database handling
pool = ConnectionPool(
    conninfo=os.getenv("DATABASE_URL"),
    max_size=10, 
    # ADD THIS EXACT LINE:
    kwargs={"prepare_threshold": None}
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
def save_ltm(user_id: str, fact: str) -> bool:
    with pool.connection() as conn:
        existing_memories = conn.execute(
            "SELECT fact FROM long_term_memory WHERE user_id = %s", 
            (user_id,)
        ).fetchall()
        
        for memory in existing_memories:
            existing_fact = memory['fact'].lower()
            new_fact = fact.lower()
            if new_fact in existing_fact or existing_fact in new_fact:
                print(f"⚠️ Duplicate fact prevented: '{fact}' is already saved.")
                return False

        conn.execute(
            "INSERT INTO long_term_memory (user_id, fact) VALUES (%s, %s)", 
            (user_id, fact)
        )
        return True

def get_ltm(user_id: str):
    with pool.connection() as conn:
        memories = conn.execute("SELECT fact FROM long_term_memory WHERE user_id = %s", (user_id,)).fetchall()
        return [m['fact'] for m in memories]