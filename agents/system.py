import json
import os
import time
import subprocess
import sys
import io
import urllib.request
import random
import re

# --- WINDOWS UTF-8 ENCODING ---
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def agent_log(msg):
    print(msg, file=sys.stderr, flush=True)

# --- REUSABLE API WRAPPER ---
def ask_api_hybrid(url, headers, body, model_name):
    try:
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers)
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode())
            if "anthropic" in url: return data['content'][0]['text']
            if "openai" in url: return data['choices'][0]['message']['content']
            if "generativelanguage" in url: return data['candidates'][0]['content']['parts'][0]['text']
    except Exception as e:
        print(f"[API Error - {model_name}] {e}", file=sys.stderr)
    return None

def ask_gemini(prompt, api_key, system_instruction=None):
    if not api_key: return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    instr = system_instruction or "Act as a specialized EMS orchestrator."
    body = {"contents": [{"role": "user", "parts": [{"text": f"{instr}\n\nPrompt: {prompt}"}]}]}
    return ask_api_hybrid(url, {'Content-Type': 'application/json'}, body, "Gemini")

# --- AGENT LOGIC ---
class HybridMemory:
    def __init__(self, prompt, keys):
        self.storage = {"prompt": prompt, "keys": keys, "task_type": "unknown", "sql_queries": [], "test_passed": True, "task_data": {}}
    def set(self, k, v): self.storage[k] = v
    def get(self, k, default=None): return self.storage.get(k, default)

class Planner:
    def execute(self, memory):
        p = memory.get("prompt")
        agent_log(f"🧠 Planner: Parsing Intent for '{p}'...")
        lp = p.lower().strip()
        
        # LAYER 1: STRICT REGEX HEURISTICS (Fast & Reliable)
        
        # Add Column: "Add field Salary", "New column Phone", etc.
        match = re.search(r'(?:add|new|create|create new|add a)\s+(?:field|column)\s+(\w+)', lp)
        if not match: match = re.search(r'(?:field|column)\s+(\w+)\s+(?:add|create|new)', lp)
        if match:
             memory.set("task_type", "add_column")
             memory.set("task_data", {"new_field": match.group(1)})
             return "coder"
             
        # Delete Column: "Delete field Salary", "Remove column Dob", etc.
        match = re.search(r'(?:delete|remove|drop|remove the)\s+(?:field|column)\s+(\w+)', lp)
        if not match: match = re.search(r'(?:field|column)\s+(\w+)\s+(?:delete|remove|drop)', lp)
        if match:
             memory.set("task_type", "delete_column")
             memory.set("task_data", {"delete_field": match.group(1)})
             return "coder"

        # Deploy: "Deploy to GitHub", "Push updates", etc.
        if "deploy" in lp or "github" in lp or "push" in lp:
             memory.set("task_type", "deploy")
             return "coder"

        # LAYER 2: AI BRAIN (Gemini)
        sys_instr = """Strict JSON Output Only: {"task_type": "insert_employee|delete_employee", "data": {}, "delete_value": "NAME"}
- insert_employee: "Add Surya" -> {"task_type": "insert_employee", "data": {"name": "Surya"}}
- delete_employee: "Remove Arun" -> {"task_type": "delete_employee", "delete_value": "Arun"}
Respond ONLY with JSON."""
        
        raw_res = ask_gemini(p, memory.get("keys")["gemini"], sys_instr)
        if raw_res:
            try:
                json_match = re.search(r'\{.*\}', raw_res.replace('\n', ' '))
                if json_match:
                    data = json.loads(json_match.group())
                    memory.set("task_type", data.get("task_type", "unknown"))
                    memory.set("task_data", data)
                    if data.get("task_type") != "unknown": return "coder"
            except: pass
            
        # LAYER 3: FALLBACK HEURISTICS (If AI is confused)
        
        # Delete Employee: "Delete Surya", "Remove employee Arun", etc.
        match = re.search(r'(?:delete|remove)\s+(?:employee|user|worker|the person)?\s*(\w+)', lp)
        if match:
             memory.set("task_type", "delete_employee")
             memory.set("task_data", {"delete_value": match.group(1)})
        # Insert Employee: "Add Surya", "Create user Rohan", etc.
        elif "add" in lp or "create" in lp or "new" in lp:
             # Grab first capitalized word or first non-keyword
             words = p.split()
             name = words[-1] # Simple guess
             memory.set("task_type", "insert_employee")
             memory.set("task_data", {"data": {"name": name.capitalize(), "role": "Employee"}})
             
        return "coder"

class Coder:
    def execute(self, memory):
        tt = memory.get("task_type")
        td = memory.get("task_data")
        agent_log(f"👨‍💻 Coder: Processing {tt}...")
        queries = []
        
        if tt == "add_column":
            col = td.get("new_field", "").lower().replace(" ", "_").strip()
            if col: queries.append(f"ALTER TABLE employees ADD COLUMN IF NOT EXISTS \"{col}\" TEXT;")
        elif tt == "insert_employee":
            ed = td.get("data", {})
            if ed.get("name"):
                 if not ed.get("email"): ed["email"] = f"{ed.get('name','user').lower()}@ems.com"
                 cols = ", ".join([f'"{k}"' for k in ed.keys()])
                 vals = ", ".join([f"'{str(v)}'" for v in ed.values()])
                 queries.append(f"INSERT INTO employees ({cols}) VALUES ({vals});")
        elif tt == "delete_employee":
            val = td.get("delete_value", "")
            if val:
                queries.append(f"DELETE FROM employees WHERE name ILIKE '%{val}%' OR email ILIKE '%{val}%';")
        elif tt == "delete_column":
            col = td.get("delete_field", "")
            if col: 
                queries.append(f"ALTER TABLE employees DROP COLUMN IF EXISTS \"{col}\";")
                # Also drop column from attendance if it was there? No, just employees.
            
        memory.set("sql_queries", queries)
        return "tester"

class Tester:
    def execute(self, memory):
        if memory.get("task_type") == "deploy":
            agent_log("🧪 Tester: Running Node.js tests...")
            try:
                subprocess.run(["node", "backend/integration.test.js"], check=True)
            except:
                memory.set("test_passed", False)
                return "finish"
        return "devops"

class DevOps:
    def execute(self, memory):
        if memory.get("task_type") == "deploy" and memory.get("test_passed"):
            agent_log("⚙️ DevOps: Pushing to GitHub...")
            try:
                subprocess.run(["git", "add", "."], cwd=".")
                subprocess.run(["git", "commit", "-m", "AI Swarm Deploy 🚀"], cwd=".")
                subprocess.run(["git", "push"], cwd=".")
            except: pass
        return "finish"

def orchestrate(p, gk):
    keys = {"gemini": gk, "claude": os.getenv("CLAUDE_API_KEY"), "openai": os.getenv("OPENAI_API_KEY")}
    memory = HybridMemory(p, keys)
    agents = {"planner": Planner(), "coder": Coder(), "tester": Tester(), "devops": DevOps()}
    curr = "planner"
    try:
        while curr != "finish": curr = agents[curr].execute(memory)
    except Exception as e: print(f"[Loop Error] {e}", file=sys.stderr)

    # FINAL MARKER JSON
    result = {
        "status": "success" if memory.get("test_passed") else "error",
        "task": memory.get("task_type"),
        "queries": memory.get("sql_queries"),
        "message": f"Hybrid AI Swarm successfully executed: {memory.get('task_type')}"
    }
    sys.stdout.write("\n---BEGIN_JSON---\n")
    sys.stdout.write(json.dumps(result))
    sys.stdout.write("\n---END_JSON---\n")
    sys.stdout.flush()

if __name__ == "__main__":
    if len(sys.argv) < 3: sys.exit(1)
    orchestrate(sys.argv[1], sys.argv[2])
