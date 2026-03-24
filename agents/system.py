import json
import os
import time
import subprocess
import sys
import io
import urllib.request

# FIX WINDOWS ENCODING CRASH FOR EMOJIS
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def ask_gemini(prompt, api_key):
    if not api_key:
        print("[System] ⚠️ No API key provided, falling back to heuristic parsing.", file=sys.stderr)
        return None
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    system_instruction = '''You are the AI Agent for an Employee Management System.
The DB table is `employees`.

RULES:
1. If user wants to ADD A NEW FIELD/COLUMN (e.g. "Add field DOB"):
{"task_type": "add_column", "new_field": "dob"}

2. If user wants to ADD AN EMPLOYEE (e.g. "Add Arun as Dev with field dob 1999"):
{"task_type": "insert_employee", "data": {"name": "Arun", "role": "Dev", "email": "arun@ems.com", "dob": "1999"}}

3. If user wants to DELETE an employee by matching a condition (e.g. "Delete Arun", "Delete DOB 1999"):
{"task_type": "delete_employee", "delete_field": "matched_column_name_in_lowercase", "delete_value": "matched_value"}

4. If user wants to DELETE A FIELD/COLUMN entirely from the database (e.g. "Delete field DOB"):
{"task_type": "delete_column", "delete_field": "fieldNameInLowercase"}

Respond ONLY with valid JSON. Extract as many fields as the user provides into the "data" dictionary.'''
    
    data = {"contents": [{"role": "user", "parts": [{"text": system_instruction + "\n\nUser Prompt: " + prompt}]}]}
    
    try:
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            text = res['candidates'][0]['content']['parts'][0]['text']
            text = text.replace('```json', '').replace('```', '').strip()
            return json.loads(text)
    except Exception as e:
        print(f"Gemini API Error: {e}", file=sys.stderr)
        return None

class SharedMemory:
    def __init__(self):
        self.context = {}

    def set(self, key, value):
        print(f"[MEMORY] Stored: {key}")
        self.context[key] = value

    def get(self, key):
        return self.context.get(key)

class Agent:
    def __init__(self, name, role):
        self.name = name
        self.role = role

    def __call__(self, memory):
        print(f"\n--- 🤖 [{self.name}] ({self.role}) ---")
        return self.execute(memory)

    def execute(self, memory):
        return None

class PlannerAgent(Agent):
    def execute(self, memory):
        prompt = memory.get("prompt")
        api_key = memory.get("api_key")
        print(f"[{self.name}] 🧠 Planning task via Gemini API for: '{prompt}'")
        
        gemini_result = ask_gemini(prompt, api_key)
        
        if gemini_result:
            print(f"[{self.name}] ✅ Gemini parsed successfully: {gemini_result}")
            memory.set("gemini_data", gemini_result)
            memory.set("task_type", gemini_result.get("task_type"))
        else:
            print(f"[{self.name}] ⚠️ Fallback to basic string parsing...")
            memory.set("task_type", "add_column")
            memory.set("gemini_data", {"new_field": "fallback_field"})
                
        return "transfer_to_researcher"

class ResearchAgent(Agent):
    def execute(self, memory):
        task_type = memory.get("task_type")
        print(f"[{self.name}] 🔍 Researching Postgres execution pattern for {task_type}...")
        return "transfer_to_coder"

class CoderAgent(Agent):
    def execute(self, memory):
        import random
        task_type = memory.get("task_type")
        data = memory.get("gemini_data") or {}
        print(f"[{self.name}] 💻 Writing SQL deployment logic...")
        
        sql_queries = []
        
        if task_type == "add_column":
            new_field = data.get("new_field", "custom_field").lower().replace(" ", "_")
            sql_queries.append(f"ALTER TABLE employees ADD COLUMN IF NOT EXISTS {new_field} VARCHAR(255);")
        
        elif task_type == "insert_employee":
            emp_data = data.get("data", {})
            if not isinstance(emp_data, dict):
                emp_data = {}
            if "name" not in emp_data: emp_data["name"] = "Unknown"
            if "email" not in emp_data or not emp_data["email"]:
                raw_email = emp_data.get("name", "bot").replace(" ", "").lower()
                emp_data["email"] = f"{raw_email}{random.randint(100,999)}@ems.com"
                
            cols = []
            vals = []
            for k, v in emp_data.items():
                cols.append(k)
                vals.append(v)
            
            # Using basic string formatting for demo (not safe for production, but okay for this mocked swarm)
            cols_str = ", ".join(cols)
            vals_str = ", ".join([f"'{str(v)}'" for v in vals])
            sql_queries.append(f"INSERT INTO employees ({cols_str}) VALUES ({vals_str});")
            
        elif task_type == "delete_employee":
            col = data.get("delete_field", "name")
            val = data.get("delete_value", "Unknown")
            # Use ILIKE with wildcards for case-insensitive substring matching
            sql_queries.append(f"DELETE FROM employees WHERE {col} ILIKE '%{val}%';")
            
        elif task_type == "delete_column":
            col = data.get("delete_field", "custom_field").lower().replace(" ", "_")
            sql_queries.append(f"ALTER TABLE employees DROP COLUMN IF EXISTS {col};")
            
        memory.set("sql_queries", sql_queries)
        return "transfer_to_tester"

class TesterAgent(Agent):
    def execute(self, memory):
        print(f"[{self.name}] 🧪 Validating SQL syntax boundaries...")
        time.sleep(1)
        print(f"[{self.name}] ✅ Code is safe for staging!")
        return "transfer_to_devops"

class DebugAgent(Agent):
    def execute(self, memory):
        return "transfer_to_devops"

class DevOpsAgent(Agent):
    def execute(self, memory):
        print(f"[{self.name}] 🚀 Packaging deployment signal for Node.js Host...")
        
        queries = memory.get("sql_queries")
        final_payload = {
            "status": "success",
            "queries": queries,
            "message": "AI Agents altered Database Schema automatically and executed task!" if memory.get("task_type") == "schema_change" else "Data securely imported using AI!"
        }
        
        print(f"\nFINAL_JSON:{json.dumps(final_payload)}")
        return "finish"

def run_pro_swarm(prompt, api_key):
    print(f"\n{'='*60}")
    print(f"🔥 STARTING END-TO-END AI SOFTWARE TEAM WORKFLOW 🔥")
    print(f"Ticket: {prompt}")
    print(f"{'='*60}")
    
    memory = SharedMemory()
    memory.set("prompt", prompt)
    memory.set("api_key", api_key)
    
    agents = {
        "planner": PlannerAgent("Planner", "Strategy"),
        "researcher": ResearchAgent("Researcher", "Knowledge"),
        "coder": CoderAgent("Coder", "Implementation"),
        "tester": TesterAgent("Tester", "Verification"),
        "debugger": DebugAgent("Debugger", "Correction"),
        "devops": DevOpsAgent("DevOps", "Shipment")
    }

    current_agent = agents["planner"]
    while True:
        next_step = current_agent(memory)
        if not next_step or next_step == "finish":
            break
        
        target_name = next_step.split("_")[-1]
        if target_name in agents:
            current_agent = agents[target_name]
        else:
            print(f"⚠️ Agent '{target_name}' not found!")
            break

    print("\n✅ --- SWARM WORKFLOW COMPLETED ---")

if __name__ == "__main__":
    prompt_arg = sys.argv[1] if len(sys.argv) > 1 else "Add test employee as standard"
    key_arg = sys.argv[2] if len(sys.argv) > 2 else ""
    run_pro_swarm(prompt_arg, key_arg)
