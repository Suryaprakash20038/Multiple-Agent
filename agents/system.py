import json
import os
import time
import subprocess
import sys
import io
import urllib.request
import urllib.parse
import base64
import re

# --- WINDOWS UTF-8 ENCODING ---
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', newline='\n', line_buffering=False)

def agent_log(msg):
    print(msg, file=sys.stderr, flush=True)

# ============================================================
#  SINGLE LLM: Google Gemini — Used by ALL Agents
#  Each agent calls Gemini with a DIFFERENT system prompt (role)
# ============================================================

def ask_gemini(prompt, api_key, system_instruction):
    """Call Gemini API with a specific role/system instruction."""
    if not api_key: return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={api_key}"
    body = {"contents": [{"role": "user", "parts": [{"text": f"{system_instruction}\n\nPrompt: {prompt}"}]}]}
    try:
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode())
            return data['candidates'][0]['content']['parts'][0]['text']
    except Exception as e:
        agent_log(f"  [Gemini API Error] {e}")
    return None

# ============================================================
#  SHARED MEMORY — Communication between all agents
# ============================================================

class HybridMemory:
    def __init__(self, prompt, gemini_key):
        self.storage = {
            "prompt": prompt,
            "gemini_key": gemini_key,
            "task_type": "unknown",
            "sql_queries": [],
            "test_passed": True,
            "task_data": {},
            "ai_agents_used": []
        }
    def set(self, k, v): self.storage[k] = v
    def get(self, k, default=None): return self.storage.get(k, default)
    def log_ai(self, agent_name, role):
        self.storage["ai_agents_used"].append({"agent": agent_name, "ai": f"Gemini ({role})"})

# ============================================================
#  AGENT 1: PLANNER
#  Gemini Role: "Intent Classifier & Semantic Router"
#  Job: Understand what the user wants (DB, Code, or Chat)
# ============================================================

# ============================================================
#  AGENT 1: PLANNER
#  Gemini Role: "Intent Classifier & Semantic Router"
#  Job: Understand what the user wants (DB, Code, or Chat)
# ============================================================

# ============================================================
#  AGENT 1: PLANNER
#  Gemini Role: "Intent Classifier & Semantic Router"
#  Job: Understand what the user wants (DB, Code, or Chat)
# ============================================================

# ============================================================
#  SMART DATATYPE INFERENCE — Used by Planner for add_column
# ============================================================

DATATYPE_ALIASES = {'int': 'INTEGER', 'bool': 'BOOLEAN', 'float': 'DECIMAL', 'real': 'DECIMAL'}

def infer_datatype(field_name):
    """Infer PostgreSQL datatype from field name."""
    fn = field_name.lower()
    if fn in {'salary', 'age', 'phone', 'mobile', 'contact', 'count', 'amount', 'quantity', 'year', 'number', 'zip', 'pincode'} or fn.endswith('_count') or fn.endswith('_number'):
        return 'INTEGER'
    if fn in {'price', 'rate', 'percentage', 'gpa', 'cgpa', 'cost', 'fee', 'wage'} or fn.endswith('_rate') or fn.endswith('_price'):
        return 'DECIMAL'
    if fn in {'dob', 'date_of_birth', 'join_date', 'start_date', 'end_date', 'birth_date', 'hire_date'} or fn.endswith('_date') or fn.startswith('date_'):
        return 'DATE'
    if fn in {'is_active', 'is_verified', 'status_flag', 'is_deleted', 'is_admin'} or fn.startswith('is_') or fn.startswith('has_'):
        return 'BOOLEAN'
    if fn in {'email', 'name', 'address', 'description', 'notes', 'title', 'city', 'country'}:
        return 'VARCHAR(255)'
    return 'TEXT'

def detect_value_type(val):
    """Detect what column a value belongs to by its format."""
    v = val.strip()
    if '@' in v and '.' in v:
        return 'email'
    if re.match(r'^\d{4}-\d{2}-\d{2}$', v):
        return 'dob'
    if re.match(r'^\d{10}$', v):
        return 'phone'
    if re.match(r'^\d+$', v) and len(v) <= 8:
        return 'salary'
    return 'role'

class Planner:
    def execute(self, memory):
        p = memory.get("prompt")
        agent_log(f"\n{'='*50}")
        agent_log(f"🧠 PLANNER AGENT")
        agent_log(f"   Gemini Role: Intent Classifier & Router")
        agent_log(f"   Input: '{p}'")
        agent_log(f"{'='*50}")
        lp = p.lower().strip()

        # LAYER 1: REGEX HEURISTICS (Fast, no API call - Fixes 429 error for basic tasks)
        agent_log("   Layer 1: Regex patterns...")

        # 0. Creative & Communication Tasks (Highest Priority for General Mode)
        if re.search(r'\b(draw|paint|sketch|generate|create|make)\b', lp) and re.search(r'\b(image|picture|photo|dog|cat|landscape|vision|art|painting|drawing|scenery)\b', lp):
            memory.set("task_type", "create_image")
            agent_log("   ✅ Matched: create_image")
            return "creative"

        # 0.1 Travel Detection (Fast Regex)
        if re.search(r'\b(trip|travel|plan|planning|itinerary|budget|vacation|holiday|tour|to|from)\b', lp):
            # Only trigger if it's likely a travel request and not just a 'new page' create
            if "page" not in lp and "tab" not in lp and "employee" not in lp:
                memory.set("task_type", "trip_plan")
                agent_log("   ✅ Matched: trip_plan (Regex)")
                return "travel"
        
        if "video" in lp and ("create" in lp or "generate" in lp or "make" in lp):
            memory.set("task_type", "create_video")
            agent_log("   ✅ Matched: create_video")
            return "creative"

        if ("mail" in lp or "email" in lp) and "@" in lp:
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', lp)
            memory.set("task_type", "send_email")
            memory.set("task_data", {"to": email_match.group(0) if email_match else "unknown", "subject": "Automated AI Message"})
            agent_log("   ✅ Matched: send_email")
            return "mail"

        # 0. Leave Management: "Apply leave for Surya for 3 days", "Apply 5 days sick leave for Arun"
        # Pattern: apply/request leave [for] <name> [for] <N> days
        if "leave" in lp and re.search(r'(?:apply|request|grant|give|mark|submit)', lp):
            name_match = re.search(r'(?:for|to)\s+([a-zA-Z]+)', lp)
            days_match = re.search(r'(\d+)\s*(?:day|days)', lp)
            type_match = re.search(r'(sick|casual|earned|maternity|paternity|unpaid)\s*(?:leave)?', lp)

            emp_name = name_match.group(1).title() if name_match else "Employee"
            num_days = int(days_match.group(1)) if days_match else 1
            leave_type = type_match.group(1).title() if type_match else "Casual"

            # Skip if name is a leave type word
            if emp_name.lower() in ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid', 'leave', 'days', 'day']:
                # Try second "for" match
                all_fors = re.findall(r'(?:for|to)\s+([a-zA-Z]+)', lp)
                emp_name = next((n.title() for n in all_fors if n.lower() not in ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid', 'leave', 'days', 'day']), "Employee")

            memory.set("task_type", "apply_leave")
            memory.set("task_data", {"employee_name": emp_name, "days": num_days, "leave_type": leave_type})
            agent_log(f"   ✅ Matched: apply_leave → '{emp_name}' for {num_days} days ({leave_type})")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 0b. Show Leaves: "show leaves", "list all leaves", "pending leaves"
        if "leave" in lp and re.search(r'(?:show|list|view|display|get|fetch|pending|all|approved|rejected)', lp):
            memory.set("task_type", "query_leaves")
            status_match = re.search(r'(pending|approved|rejected)', lp)
            memory.set("task_data", {"status_filter": status_match.group(1).title() if status_match else None})
            agent_log(f"   ✅ Matched: query_leaves")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 0c. Approve/Reject Leave: "approve leave for Surya", "reject Arun leave"
        if "leave" in lp and re.search(r'(?:approve|reject|cancel)', lp):
            action = "Approved" if "approve" in lp else "Rejected" if "reject" in lp else "Cancelled"
            name_match = re.search(r'(?:for|of)\s+([a-zA-Z]+)', lp)
            if not name_match:
                name_match = re.search(r'(?:approve|reject|cancel)\s+([a-zA-Z]+)', lp)
            emp_name = name_match.group(1).title() if name_match else None
            if emp_name and emp_name.lower() in ['leave', 'the', 'all']:
                emp_name = None
            memory.set("task_type", "update_leave")
            memory.set("task_data", {"employee_name": emp_name, "new_status": action})
            agent_log(f"   ✅ Matched: update_leave → {action} for {emp_name}")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 1. Add Column/Field: "Add field salary", "Add field salary INTEGER"
        match = re.search(r'(?:add|new|create|create new|add a)\s+(?:field|column)\s+(\w+)(?:\s+(integer|int|decimal|float|real|date|boolean|bool|varchar|text))?', lp)
        if not match: match = re.search(r'(?:field|column)\s+(\w+)(?:\s+(integer|int|decimal|float|real|date|boolean|bool|varchar|text))?\s+(?:add|create|new)', lp)
        if match:
            field_name = match.group(1).lower().replace(" ", "_").strip()
            explicit_type = match.group(2).lower() if match.group(2) else None
            resolved_type = DATATYPE_ALIASES.get(explicit_type, explicit_type.upper()) if explicit_type else infer_datatype(field_name)
            memory.set("task_type", "add_column")
            memory.set("task_data", {"new_field": field_name, "datatype": resolved_type})
            agent_log(f"   ✅ Matched: add_column → '{field_name}' ({resolved_type})")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 2. Delete Column/Field: "Delete field salary", "Drop column phone"
        match = re.search(r'(?:delete|remove|drop|remove the)\s+(?:field|column)\s*(\w+)', lp)
        if match:
            memory.set("task_type", "delete_column")
            memory.set("task_data", {"delete_field": match.group(1).lower().replace(" ", "_").strip()})
            agent_log(f"   ✅ Matched: delete_column → '{match.group(1)}'")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 3. Update Employee: "Update Surya salary 50000" or "Update Surya phone 123 salary 50000 dob 2003-02-02"
        match = re.search(r'(?:update|modify|change)\s+(?:employee|user|person)?\s*(\w+)\s+(.+)', lp)
        if match:
            name = match.group(1).title()
            rest = match.group(2).strip()
            # Parse field-value pairs: "phone 123 salary 50000 dob 2003-02-02"
            updates = {}
            tokens = rest.replace(' to ', ' ').replace(' = ', ' ').split()
            i = 0
            while i < len(tokens):
                field = tokens[i].lower().strip()
                if i + 1 < len(tokens):
                    value = tokens[i + 1].strip()
                    updates[field] = value
                    i += 2
                else:
                    break
            if updates:
                memory.set("task_type", "update_employee")
                memory.set("task_data", {"name": name, "updates": updates})
                agent_log(f"   ✅ Matched: update_employee → '{name}' fields: {updates}")
                memory.log_ai("Planner", "Regex")
                return "coder"

        # 4. Add Employee: "Add Surya" or "Add Surya developer ssathis@gmail.com 2003-02-02 1234567899 25000"
        match = re.search(r'(?:add|new|create|create new|add a)\s+(?:employee|user|person|staff)?\s*(.+)', lp)
        if match and "column" not in lp and "field" not in lp and "page" not in lp and "leave" not in lp:
            parts = match.group(1).strip().split()
            name = parts[0].title()
            extra_fields = {}
            if len(parts) > 1:
                for val in parts[1:]:
                    col = detect_value_type(val)
                    extra_fields[col] = val
            memory.set("task_type", "insert_employee")
            memory.set("task_data", {"employee_name": name, "extra_fields": extra_fields})
            agent_log(f"   ✅ Matched: insert_employee → '{name}' extra: {extra_fields}")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 5. Delete Employee: "Delete Sasi", "Remove employee Sasi"
        match = re.search(r'(?:delete|remove|drop|remove the)\s+(?:employee|user|person|staff)?\s*(\w+)', lp)
        if match and "column" not in lp and "field" not in lp:
            memory.set("task_type", "delete_employee")
            memory.set("task_data", {"delete_value": match.group(1).title()})
            agent_log(f"   ✅ Matched: delete_employee → '{match.group(1)}'")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 6. Create Page / Tab: "Create a Shift and Rostering page"
        match = re.search(r'(?:create|add|new)\s*(?:a|new)?\s*(.+?)\s*(?:page|tab)', lp)
        if match and "column" not in lp and "field" not in lp and "employee" not in lp:
            memory.set("task_type", "code_edit")
            memory.set("task_data", {"new_page": match.group(1).title()})
            agent_log(f"   ✅ Matched: code_edit (Dynamic Page) → '{match.group(1)}'")
            memory.log_ai("Planner", "Regex")
            return "coder"

        # 7. Force UI Editing if 'page' or 'tab' is mentioned elsewhere
        if ("page" in lp or "tab" in lp) and "delete" not in lp and "column" not in lp and "field" not in lp:
            memory.set("task_type", "code_edit")
            agent_log("   ⚠️ Intent: UI Modification (Implicit)")
            return "coder"

        # 8. Test / Deploy
        if lp == "test" or "run test" in lp:
            memory.set("task_type", "test")
            return "tester"
        if "deploy" in lp or "github" in lp or "push" in lp:
            memory.set("task_type", "deploy")
            return "coder"


        # 8. Show/Query (Fast Detection)
        if re.search(r'\b(?:show|list|display|get|fetch|view|how many|count|total|search|find|who is|where is|details of)\b', lp):
            memory.set("task_type", "query_data")
            agent_log("   ✅ Matched: query_data (Regex)")

        # LAYER 2: GEMINI AS INTENT CLASSIFIER (Advanced Autonomous Router)
        agent_log("   Layer 2: Asking Gemini 3 (Autonomous Decision)...")
        router_prompt = "You are a master orchestrator. Analyze user request. Decide task_type: \n- 'create_image': If prompt describes visual/art.\n- 'trip_plan': If it's a travel/trip/vacation request (e.g., 'A to B budget X').\n- 'database_work', 'code_edit', 'send_email', 'general_chat'. \nReturn ONLY JSON."

        raw_res = ask_gemini(p, memory.get("gemini_key"), router_prompt)
        if raw_res:
            try:
                json_match = re.search(r'\{.*\}', raw_res.replace('\n', ' '))
                if json_match:
                    data = json.loads(json_match.group())
                    task = data.get("task_type", "unknown")
                    memory.set("task_type", task)
                    memory.set("task_data", data)
                    agent_log(f"   ✅ Gemini routed to: {task}")
                    memory.log_ai("Planner", "Semantic Router")
                    if task in ["create_image", "create_video"]: return "creative"
                    if task == "trip_plan": return "travel"
                    if task == "send_email": return "mail"
                    if task == "general_chat":
                        chat_res = ask_gemini(p, memory.get("gemini_key"), "You are a versatile AI assistant. Analyze the prompt and provide a helpful, relevant response.")
                        memory.set("chat_response", chat_res)
                        return "finish"
                    return "coder"
            except:
                pass

        # FINAL FALLBACK
        if memory.get("task_type") == "unknown":
            memory.set("task_type", "query_data")
            memory.set("task_data", {"query_hint": "custom"})
            agent_log("   Fallback: query_data")
        return "coder"

# ============================================================
#  AGENT 2: CODER
#  Gemini Role: "Fullstack Engineer & SQL Expert"
#  Job: Generate SQL or Frontend Code edits
# ============================================================

class Coder:
    def execute(self, memory):
        tt = memory.get("task_type")
        td = memory.get("task_data")
        prompt = memory.get("prompt")
        agent_log(f"\n{'='*50}")
        agent_log(f"👨‍💻 CODER AGENT")
        agent_log(f"   Task: {tt}")
        agent_log(f"{'='*50}")
        queries = []
        gemini_key = memory.get("gemini_key")

        # 1. SPECIAL CASE: Code Edit (Frontend Modification)
        if tt == "code_edit":
            agent_log("   Attempting Code Modification...")
            try:
                root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                app_path = os.path.join(root_path, "frontend", "App.jsx")
                with open(app_path, "r", encoding="utf-8") as f: app_code = f.read()

                coder_prompt = f"""You are a Fullstack React expert.
Task: {prompt}

Structure of App.jsx:
- Navigation: An array of objects `{{ id, label, icon }}` in the main `return` block.
- State: `activeTab` controls what component is shown.
- Content: A ternary/conditional section that renders `employees`, `attendance`, `leaves`, or `payroll`.

Your Job:
1. Add the new page/tab to the navigation array.
2. Add a new conditional block in the main content area to render the UI for this new tab.
3. If the user asked to 'integrate', show data from the `employees` array in the new page or create a relevant mock UI (like a table).
4. Maintain the current glassmorphism design (backdrop-filter: blur(14px), card-bg, etc.).
5. IMPORTANT: Return the FULL updated code for App.jsx. No explanations. No markdown."""

                updated_code = ask_gemini(coder_prompt, gemini_key, "You are a Fullstack Engineer. Return ONLY the full updated code.")
                if updated_code:
                    clean_code = updated_code.strip().replace("```javascript", "").replace("```jsx", "").replace("```", "").strip()
                    with open(app_path, "w", encoding="utf-8") as f: f.write(clean_code)
                    agent_log("   ✅ Successfully modified App.jsx")
                    memory.set("code_edit_success", True)
                    memory.log_ai("Coder", "Fullstack Engineer")
                    return "tester"
            except Exception as e:
                agent_log(f"   ❌ Code Edit Failed: {e}")
                return "finish"

        # 2. DATABASE CASE: Generate SQL
        if tt != "deploy" and tt != "test":
            agent_log("   Generating SQL...")
            sql_prompt = f"PostgreSQL expert. User: {prompt}. Task: {tt}. Context: {json.dumps(td)}. Return ONLY SQL."
            gemini_sql = ask_gemini(sql_prompt, gemini_key, "Return ONLY raw SQL.")
            
            if gemini_sql:
                sql = gemini_sql.strip().replace("```sql", "").replace("```", "").strip()
                queries.append(sql if sql.endswith(';') else sql + ';')
                agent_log(f"   ✅ Gemini SQL: {queries[0][:60]}...")
                memory.log_ai("Coder", "SQL Expert")
            else:
                # LOCAL FALLBACK (Essential for 429 Errors)
                agent_log("   ⚠️ Gemini Failed - Using Local SQL Generation Fallback")
                if tt == "insert_employee":
                    name = td.get("employee_name", "User")
                    extra = td.get("extra_fields", {})
                    role = extra.get("role", "Employee")
                    email = extra.get("email", f"{name.lower().replace(' ', '_')}@ems.com")
                    # Build columns and values dynamically
                    cols = ["name", "role", "email"]
                    vals = [f"'{name}'", f"'{role}'", f"'{email}'"]
                    for col_name in ['dob', 'phone', 'salary']:
                        if col_name in extra:
                            cols.append(f'"{col_name}"')
                            vals.append(f"'{extra[col_name]}'")
                    queries.append(f"INSERT INTO employees ({', '.join(cols)}) VALUES ({', '.join(vals)});")
                elif tt == "delete_employee" or "delete employee" in prompt.lower():
                    name = td.get("delete_value", "User")
                    queries.append(f"DELETE FROM employees WHERE name ILIKE '%{name}%' OR email ILIKE '%{name}%';")
                elif tt == "add_column":
                    col = td.get("new_field", "extra_info")
                    dtype = td.get("datatype") or infer_datatype(col)
                    queries.append(f'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "{col}" {dtype};')
                elif tt == "delete_column":
                    col = td.get("delete_field", "extra_info")
                    queries.append(f"ALTER TABLE employees DROP COLUMN IF EXISTS \"{col}\";")
                elif tt == "update_employee":
                    name = td.get("name")
                    updates = td.get("updates", {})
                    # Backward compat: old single-field format
                    if not updates and td.get("field") and td.get("value"):
                        updates = {td["field"]: td["value"]}
                    if name and updates:
                        set_parts = [f'"{k}" = \'{v}\'' for k, v in updates.items()]
                        queries.append(f"UPDATE employees SET {', '.join(set_parts)} WHERE name ILIKE '%{name}%';")
                elif tt == "apply_leave":
                    name = td.get("employee_name", "Employee")
                    days = td.get("days", 1)
                    leave_type = td.get("leave_type", "Casual")
                    queries.append(f"INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason) SELECT id, '{leave_type}', CURRENT_DATE, CURRENT_DATE + INTERVAL '{days - 1} days', 'Applied via AI Agent' FROM employees WHERE name ILIKE '%{name}%' LIMIT 1;")
                elif tt == "query_leaves":
                    status_filter = td.get("status_filter")
                    if status_filter:
                        queries.append(f"SELECT l.*, e.name as employee_name FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = '{status_filter}' ORDER BY l.applied_at DESC;")
                    else:
                        queries.append("SELECT l.*, e.name as employee_name FROM leaves l JOIN employees e ON l.employee_id = e.id ORDER BY l.applied_at DESC;")
                elif tt == "update_leave":
                    new_status = td.get("new_status", "Approved")
                    emp_name = td.get("employee_name")
                    if emp_name:
                        queries.append(f"UPDATE leaves SET status = '{new_status}' WHERE status = 'Pending' AND employee_id IN (SELECT id FROM employees WHERE name ILIKE '%{emp_name}%');")
                    else:
                        queries.append(f"UPDATE leaves SET status = '{new_status}' WHERE status = 'Pending';")
                elif tt == "query_data":
                    if "count" in prompt.lower(): queries.append("SELECT COUNT(*) FROM employees;")
                    elif "search" in prompt.lower() or "find" in prompt.lower():
                        term = prompt.split()[-1]
                        queries.append(f"SELECT * FROM employees WHERE name ILIKE '%{term}%' OR role ILIKE '%{term}%';")
                    else: queries.append("SELECT * FROM employees ORDER BY id DESC;")

        memory.set("sql_queries", queries)
        return "tester"



# ... rest of system.py remains similar but integrated with these changes ...


# ============================================================
#  AGENT 3: TESTER
#  Gemini Role: "SQL Validator & Security Auditor"
#  Job: Validate SQL safety + run test suites
# ============================================================

class Tester:
    def execute(self, memory):
        tt = memory.get("task_type")
        queries = memory.get("sql_queries", [])
        gemini_key = memory.get("gemini_key")
        agent_log(f"\n{'='*50}")
        agent_log(f"🧪 TESTER AGENT")
        agent_log(f"   Gemini Role: SQL Validator")
        agent_log(f"   Task: {tt}")
        agent_log(f"{'='*50}")

        # Validate SQL using Gemini (as Security Auditor)
        if gemini_key and queries:
            agent_log("   Asking Gemini (SQL Validator role)...")
            validate_prompt = f"""You are a SQL security auditor. Validate this PostgreSQL query.

Table: employees (id SERIAL PK, name VARCHAR, role VARCHAR, email VARCHAR UNIQUE, + dynamic TEXT columns)
SQL: {queries[0]}
Task: {tt}

Check for:
1. SQL syntax correctness
2. Will it work on PostgreSQL?
3. Any dangerous operations? (DROP TABLE, TRUNCATE, etc.)

Respond ONLY with JSON: {{"valid": true, "reason": "brief reason"}} or {{"valid": false, "reason": "why it's dangerous"}}"""

            val_res = ask_gemini(validate_prompt, gemini_key, "You are a SQL security auditor. Return ONLY JSON.")
            if val_res:
                try:
                    json_match = re.search(r'\{.*\}', val_res.replace('\n', ' '))
                    if json_match:
                        validation = json.loads(json_match.group())
                        is_valid = validation.get("valid", True)
                        reason = validation.get("reason", "")
                        if is_valid:
                            agent_log(f"   ✅ Gemini validated: SQL is safe — {reason}")
                            memory.log_ai("Tester", "SQL Validator")
                        else:
                            agent_log(f"   ❌ Gemini rejected SQL: {reason}")
                            memory.log_ai("Tester", "SQL Validator")
                            memory.set("test_passed", False)
                            memory.set("sql_queries", [])
                            return "finish"
                except:
                    agent_log("   ⚠️ Validation parse failed, proceeding")
                    memory.log_ai("Tester", "SQL Validator (parse error)")
            else:
                agent_log("   ⚠️ Gemini unavailable, skipping validation")
                memory.log_ai("Tester", "Skipped")
        else:
            if not queries:
                agent_log("   No SQL to validate")
            memory.log_ai("Tester", "Skipped")

        # For DEPLOY: Run test suites (original behavior)
        if tt == "deploy":
            agent_log("   🧪 Running 2 Automated Test Suites before Push...")
            try:
                root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                integration_test = os.path.join(root_path, "backend", "integration.test.js")
                lifecycle_test = os.path.join(root_path, "backend", "automated_tests.js")

                subprocess.run(["node", integration_test], check=True, stdout=sys.stderr, stderr=sys.stderr)
                agent_log("   ✅ Test 1 (Integration) Passed!")

                subprocess.run(["node", lifecycle_test], check=True, stdout=sys.stderr, stderr=sys.stderr)
                agent_log("   ✅ Test 2 (Automated Lifecycle) Passed!")

            except Exception as e:
                agent_log(f"   ❌ PRE-DEPLOYMENT TESTS FAILED: {e}")
                memory.set("test_passed", False)
                return "finish"

        # For TEST: Capture output & parse results for frontend
        if tt == "test":
            agent_log("   🧪 Running 2 Automated Test Suites...")
            test_results = {"integration": None, "automated": None, "individual": [], "passed": 0, "failed": 0}
            try:
                root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                integration_test = os.path.join(root_path, "backend", "integration.test.js")
                lifecycle_test = os.path.join(root_path, "backend", "automated_tests.js")

                r1 = subprocess.run(["node", integration_test], capture_output=True, text=True, encoding="utf-8", timeout=30)
                test_results["integration"] = "PASS" if r1.returncode == 0 else "FAIL"
                agent_log(f"   {'✅' if r1.returncode == 0 else '❌'} Test 1 (Integration) {'Passed' if r1.returncode == 0 else 'Failed'}!")

                r2 = subprocess.run(["node", lifecycle_test], capture_output=True, text=True, encoding="utf-8", timeout=60)
                out2 = (r2.stdout or "") + "\n" + (r2.stderr or "")

                for line in out2.split("\n"):
                    line = line.strip()
                    if "PASS:" in line:
                        name = line.split("PASS:", 1)[1].strip()
                        test_results["individual"].append({"name": name, "status": "PASS"})
                    elif "FAIL:" in line and "PRE-DEPLOYMENT" not in line:
                        parts = line.split("FAIL:", 1)
                        name = parts[1].strip() if len(parts) > 1 else "Unknown"
                        test_results["individual"].append({"name": name, "status": "FAIL"})

                summary_match = re.search(r'RESULTS:\s*(\d+)\s*passed,\s*(\d+)\s*failed', out2)
                if summary_match:
                    test_results["passed"] = int(summary_match.group(1))
                    test_results["failed"] = int(summary_match.group(2))

                test_results["automated"] = "PASS" if r2.returncode == 0 else "FAIL"
                agent_log(f"   {'✅' if r2.returncode == 0 else '❌'} Test 2 (Automated) {test_results['passed']}/{test_results['passed'] + test_results['failed']}")

            except Exception as e:
                agent_log(f"   ❌ TEST ERROR: {e}")
                test_results["error"] = str(e)

            memory.set("test_results", test_results)
            if test_results.get("integration") == "FAIL" or test_results.get("automated") == "FAIL" or test_results.get("error"):
                memory.set("test_passed", False)
            return "finish"

        return "devops"

# ============================================================
#  AGENT 4: DEVOPS
#  No AI needed — Git CLI operations
#  Job: Push code to GitHub
# ============================================================

class DevOps:
    def execute(self, memory):
        agent_log(f"\n{'='*50}")
        agent_log(f"⚙️ DEVOPS AGENT (Git CLI)")
        agent_log(f"{'='*50}")

        if memory.get("task_type") == "deploy" and memory.get("test_passed"):
            agent_log("   Pushing to GitHub...")
            try:
                subprocess.run(["git", "add", "."], check=False, stdout=sys.stderr, stderr=sys.stderr)
                subprocess.run(["git", "commit", "--allow-empty", "-m", "AI Swarm Autonomous Push 🚀"], check=False, stdout=sys.stderr, stderr=sys.stderr)
                res = subprocess.run(["git", "push"], capture_output=True, text=True)

                output_log = res.stdout + "\n" + res.stderr
                memory.set("devops_output", output_log)

                if res.returncode != 0:
                    agent_log(f"   ❌ Git Push Error: {res.stderr}")
                    if "up-to-date" in res.stderr.lower() or "everything up-to-date" in res.stdout.lower():
                        agent_log("   ✅ Already up to date.")
                    else:
                        memory.set("test_passed", False)
                else:
                    agent_log("   ✅ Git Push Success!")
            except Exception as e:
                agent_log(f"   ❌ DevOps Error: {e}")
                memory.set("devops_output", str(e))
                memory.set("test_passed", False)
            memory.log_ai("DevOps", "Git CLI")
        else:
            agent_log("   Skipped (not a deploy task)")
            memory.log_ai("DevOps", "Skipped")

        return "finish"

# ============================================================
#  GENERAL MODE AGENTS (Imported from general_agents.py)
# ============================================================
from general_agents import run_general_mode

# ============================================================
#  ORCHESTRATOR — Unified Entry Point
# ============================================================

def orchestrate(p, gk, mode='query'):
    agent_log("\n" + "=" * 60)
    agent_log("🚀 MULTI-AGENT SWARM (Brain: Gemini)")
    agent_log("=" * 60)
    agent_log(f"🔑 Gemini API Key: {'✅ Loaded' if gk else '❌ Missing'}")
    agent_log(f"📝 Prompt: '{p}'")
    agent_log(f"🤖 Mode: {mode.upper()}")

    memory = HybridMemory(p, gk)

    if mode == 'general':
        # GENERAL MODE: Pure AI orchestration — Gemini decides everything
        agent_log("🧠 Architecture: Gemini Brain → 6 Agents (Chat, Image, Video, Email, WhatsApp, Search)")
        run_general_mode(memory)
    else:
        # QUERY MODE: DB/Code operations — unchanged
        agent_log("🤖 Architecture: Planner → Coder → Tester → DevOps")
        agents = {"planner": Planner(), "coder": Coder(), "tester": Tester(), "devops": DevOps()}
        curr = "planner"
        try:
            while curr != "finish":
                curr = agents[curr].execute(memory)
        except Exception as e:
            agent_log(f"[Loop Error] {e}")

    # Summary
    agent_log(f"\n{'='*60}")
    agent_log("📊 AGENT EXECUTION SUMMARY")
    agent_log(f"{'='*60}")
    for entry in memory.get("ai_agents_used", []):
        agent_log(f"   {entry['agent']:12s} → {entry['ai']}")
    agent_log(f"   {'Result':12s} → {memory.get('task_type')} | {'✅ Success' if memory.get('test_passed') else '❌ Failed'}")
    agent_log(f"{'='*60}\n")

    time.sleep(0.5)

    task_type = memory.get("task_type")
    test_passed = memory.get("test_passed")
    if task_type == "deploy" and test_passed:
        msg = "Automated Tests Passed ✅ & Successfully Deployed!"
    elif task_type == "test" and test_passed:
        tr = memory.get("test_results", {})
        msg = f"All Tests Passed! ✅ ({tr.get('passed', 0)}/{tr.get('passed', 0) + tr.get('failed', 0)} passed)"
    elif task_type == "test" and not test_passed:
        tr = memory.get("test_results", {})
        msg = f"Some Tests Failed ❌ ({tr.get('failed', 0)} failed, {tr.get('passed', 0)} passed)"
    elif mode == 'general':
        agents_list = [e['agent'] for e in memory.get("ai_agents_used", [])]
        msg = f"AI Agents executed: {', '.join(agents_list)}"
    else:
        msg = f"Multi-Agent AI Swarm executed: {task_type}"

    result = {
        "status": "success" if test_passed else "error",
        "task": task_type,
        "queries": memory.get("sql_queries"),
        "message": msg,
        "details": memory.get("devops_output", ""),
        "agents_used": memory.get("ai_agents_used", []),
        "test_results": memory.get("test_results"),
        "image_result": memory.get("image_result"),
        "video_result": memory.get("video_result"),
        "video_type": memory.get("video_type", "mp4"),
        "query_rows": [],
        "chat_response": memory.get("chat_response", "")
    }

    raw_json = json.dumps(result).encode('utf-8')
    b64_payload = base64.b64encode(raw_json).decode('ascii')
    sys.stdout.write(f"===AGENT_B64_START==={b64_payload}===AGENT_B64_END===")
    sys.stdout.flush()

if __name__ == "__main__":
    if len(sys.argv) < 3: sys.exit(1)
    prompt = sys.argv[1]
    api_key = sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'query'
    orchestrate(prompt, api_key, mode)
