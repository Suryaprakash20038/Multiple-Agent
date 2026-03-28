"""
GENERAL MODE: AI-POWERED MULTI-AGENT SYSTEM
Brain: Gemini (NO keyword matching, pure AI reasoning)
Agents: Chat, Image, Video, Email, WhatsApp, Search

User → Prompt → Gemini Brain → Decision → Agent(s) → Output
"""

import json
import os
import re
import random
import urllib.request
import urllib.parse

def agent_log(msg):
    import sys
    print(msg, file=sys.stderr, flush=True)

def ask_gemini(prompt, api_key, system_instruction):
    if not api_key: return None
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={api_key}"
    body = {"contents": [{"role": "user", "parts": [{"text": f"{system_instruction}\n\nPrompt: {prompt}"}]}]}
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode())
                return data['candidates'][0]['content']['parts'][0]['text']
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 2:
                wait = (attempt + 1) * 3
                agent_log(f"  [Gemini {e.code}] Waiting {wait}s before retry {attempt+2}/3...")
                time.sleep(wait)
                continue
            agent_log(f"  [Gemini API Error] {e}")
        except Exception as e:
            agent_log(f"  [Gemini API Error] {e}")
        break
    return None


# ================================================================
#  ORCHESTRATOR SYSTEM PROMPT — Gemini decides everything
# ================================================================

ORCHESTRATOR_PROMPT = """You are an intelligent AI orchestrator. Understand the user's request using reasoning (NOT keyword matching).

STRICT RULES:
1. NEVER change the subject (cricket=cricket, lion=lion, cat=cat)
2. Image vs Video MUST be separated:
   - "image" → photo, picture, poster, logo, art, illustration
   - "video" → video, animation, clip, footage
3. Clean the prompt: remove "create"/"generate", keep subject + context
   Examples: "generate cricket image" → "cricket match stadium"
             "create lion video" → "lion walking in jungle"

Available agents:
- "chat": explanation, coding, questions, writing, advice
- "image": fetch REAL images from internet matching exact subject
- "video": fetch REAL videos matching exact subject
- "email": send email (extract to, subject, body)
- "search": real-time info (news, weather, latest)

Return ONLY valid JSON:
{"actions": [{"agent": "agent_name", "params": {...}}]}"""


# ================================================================
#  AGENT 1: CHAT — General Intelligence
# ================================================================

class ChatAgent:
    def execute(self, memory, params):
        prompt = params.get("prompt", memory.get("prompt"))
        gk = memory.get("gemini_key")
        agent_log(f"\n{'='*50}")
        agent_log("💬 CHAT AGENT")
        agent_log(f"{'='*50}")

        response = ask_gemini(prompt, gk,
            "You are a highly intelligent AI assistant. Provide detailed, well-structured, helpful responses. Use markdown formatting.")

        existing = memory.get("chat_response", "")
        text = response or "I couldn't process that request right now."
        memory.set("chat_response", f"{existing}\n\n{text}".strip() if existing else text)
        memory.log_ai("Chat", "General Intelligence")


# ================================================================
#  AGENT 2: IMAGE — Vision Synthesizer
# ================================================================

class ImageAgent:
    def execute(self, memory, params):
        prompt = params.get("prompt", memory.get("prompt"))
        gk = memory.get("gemini_key")
        agent_log(f"\n{'='*50}")
        agent_log(f"🎨 IMAGE AGENT: {prompt[:60]}...")
        agent_log(f"{'='*50}")

        # Clean prompt: remove action words, keep subject
        keywords = prompt.lower()
        for rm in ["generate", "create", "make", "draw", "image of", "picture of", "image", "picture", "photo of", "photo"]:
            keywords = keywords.replace(rm, "")
        keywords = keywords.strip()
        if not keywords:
            keywords = prompt

        # Use Gemini to optimize into a visual search prompt
        better_kw = ask_gemini(prompt, gk, "Convert this into an image search query. Keep the EXACT subject (lion=lion, cricket=cricket). Add environment/context. Return ONLY the search query. Example: 'cricket' → 'cricket match stadium daylight'")
        if better_kw:
            keywords = better_kw.strip().replace('"', '').replace("'", "")

        img_url = None

        # Priority 1: SerpAPI Google Image Search (REAL images from internet)
        serp_key = os.environ.get("SERPAPI_KEY", "")
        if serp_key and "your_" not in serp_key:
            try:
                search_url = f"https://serpapi.com/search.json?q={urllib.parse.quote(keywords)}&tbm=isch&api_key={serp_key}&num=5"
                req = urllib.request.Request(search_url)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode())
                    images = data.get("images_results", [])
                    if images:
                        # Pick a random image from top 5 for variety
                        pick = images[random.randint(0, min(4, len(images) - 1))]
                        img_url = pick.get("original", pick.get("thumbnail", ""))
                        agent_log(f"   ✅ Google Images: found {len(images)} results")
            except Exception as e:
                agent_log(f"   ⚠️ SerpAPI Images failed: {e}")

        # Priority 2: LoremFlickr fallback
        if not img_url:
            encoded_kw = urllib.parse.quote(keywords.split()[0] if keywords else "photo")
            seed = random.randint(1, 100000)
            img_url = f"https://loremflickr.com/1024/1024/{encoded_kw}?random={seed}"
            agent_log(f"   Fallback: LoremFlickr")

        memory.set("image_result", img_url)

        existing = memory.get("chat_response", "")
        msg = f"🎨 Image found for: *{keywords}*"
        memory.set("chat_response", f"{existing}\n\n{msg}".strip() if existing else msg)
        memory.log_ai("Image", "Vision Synthesizer")


# ================================================================
#  AGENT 3: VIDEO — Cinematic Engine
# ================================================================

class VideoAgent:
    """Generates video using free Pexels stock videos matched by Gemini keyword."""
    # Verified real content-matched videos from Mixkit (direct MP4, no auth)
    STOCK_VIDEOS = {
        "cat": "https://assets.mixkit.co/videos/1779/1779-720.mp4",
        "dog": "https://assets.mixkit.co/videos/1210/1210-720.mp4",
        "lion": "https://assets.mixkit.co/videos/10980/10980-720.mp4",
        "nature": "https://assets.mixkit.co/videos/4818/4818-720.mp4",
        "ocean": "https://assets.mixkit.co/videos/2079/2079-720.mp4",
        "city": "https://assets.mixkit.co/videos/3428/3428-720.mp4",
        "car": "https://assets.mixkit.co/videos/34562/34562-720.mp4",
        "food": "https://assets.mixkit.co/videos/28312/28312-720.mp4",
        "rain": "https://assets.mixkit.co/videos/9536/9536-720.mp4",
        "space": "https://assets.mixkit.co/videos/39476/39476-720.mp4",
        "dance": "https://assets.mixkit.co/videos/3428/3428-720.mp4",
        "default": "https://assets.mixkit.co/videos/4818/4818-720.mp4",
    }

    def execute(self, memory, params):
        prompt = params.get("prompt", memory.get("prompt"))
        gk = memory.get("gemini_key")
        agent_log(f"\n{'='*50}")
        agent_log(f"🎬 VIDEO AGENT: {prompt[:60]}...")
        agent_log(f"{'='*50}")

        # Clean prompt to extract subject
        lp = prompt.lower()
        for rm in ["generate", "create", "make", "video of", "video", "clip of", "clip"]:
            lp = lp.replace(rm, "")
        subject = lp.strip() or prompt.lower()

        video_url = None
        video_type = "mp4"  # mp4 = direct video, embed = iframe

        # Priority 1: SerpAPI search for real video
        serp_key = os.environ.get("SERPAPI_KEY", "")
        if serp_key and "your_" not in serp_key:
            # Build search query
            search_q = subject
            better = ask_gemini(prompt, gk, "Convert to a video search query. Keep EXACT subject. Example: 'cat' → 'cat playing cute'. Return ONLY the query.")
            if better:
                search_q = better.strip().replace('"', '').replace("'", "")

            try:
                search_url = f"https://serpapi.com/search.json?search_query={urllib.parse.quote(search_q)}&engine=youtube&api_key={serp_key}"
                req = urllib.request.Request(search_url)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode())
                    videos = data.get("video_results", [])
                    if videos:
                        pick = videos[0]
                        yt_link = pick.get("link", "")
                        title = pick.get("title", subject)
                        # Extract YouTube ID and create clean embed (no branding)
                        yt_id = ""
                        if "watch?v=" in yt_link:
                            yt_id = yt_link.split("watch?v=")[1].split("&")[0]
                        elif "youtu.be/" in yt_link:
                            yt_id = yt_link.split("youtu.be/")[1].split("?")[0]
                        if yt_id:
                            # Clean embed: no logo, no title, autoplay, controls only
                            video_url = f"https://www.youtube-nocookie.com/embed/{yt_id}?autoplay=1&modestbranding=1&rel=0&showinfo=0&controls=1"
                            video_type = "embed"
                            agent_log(f"   ✅ Found: '{title[:50]}'")
            except Exception as e:
                agent_log(f"   ⚠️ Video search failed: {e}")

        # Priority 2: Mixkit stock fallback
        if not video_url:
            video_type = "mp4"
            video_url = self.STOCK_VIDEOS["default"]
            for kw, url in self.STOCK_VIDEOS.items():
                if kw != "default" and kw in subject:
                    video_url = url
                    agent_log(f"   Fallback Mixkit: {kw}")
                    break

        memory.set("video_result", video_url)
        memory.set("video_type", video_type)

        existing = memory.get("chat_response", "")
        msg = f"🎬 Video rendered for: *{subject.strip().capitalize()}*"
        memory.set("chat_response", f"{existing}\n\n{msg}".strip() if existing else msg)
        memory.log_ai("Video", "Cinematic Engine")


# ================================================================
#  AGENT 4: EMAIL — SMTP Engine
# ================================================================

class EmailAgent:
    def execute(self, memory, params):
        to_addr = params.get("to", "unknown@email.com")
        subject = params.get("subject", "")
        body = params.get("body", "")
        gk = memory.get("gemini_key")
        agent_log(f"\n{'='*50}")
        agent_log(f"📧 EMAIL AGENT: → {to_addr}")
        agent_log(f"{'='*50}")

        # Auto-generate subject from prompt if missing
        if not subject or subject == "AI Message":
            user_prompt = memory.get("prompt", "")
            subj_res = ask_gemini(user_prompt, gk, "Extract a short email subject line (max 8 words) from this request. Return ONLY the subject text.")
            if subj_res:
                subject = subj_res.strip().replace('"', '').replace("'", "")
            else:
                # Fallback: extract from prompt directly
                clean = user_prompt.lower()
                for rm in ['send email to', 'send mail to', 'email to', 'mail to', to_addr, 'about']:
                    clean = clean.replace(rm.lower(), '')
                subject = clean.strip().capitalize()[:60] or "AI Generated Message"

        # Auto-compose body from prompt context
        user_prompt = memory.get("prompt", "")
        if len(body) < 20:
            composed = ask_gemini(
                f"Write a professional email based on this request: {user_prompt}\nSubject: {subject}",
                gk, "You are a professional email writer. Write a clear, well-formatted email body based on the user's request. Include all details from the prompt. Return ONLY the email body text.")
            if composed:
                body = composed
            else:
                # Fallback: build body directly from the user's prompt
                clean_prompt = user_prompt
                for word in ['send email to', 'send mail to', 'email to', 'mail to', to_addr]:
                    clean_prompt = clean_prompt.lower().replace(word.lower(), '')
                clean_prompt = clean_prompt.strip().strip('.')
                if clean_prompt:
                    body = f"Hi,\n\nThis is regarding: {clean_prompt.capitalize()}.\n\nPlease acknowledge.\n\nBest regards,\nAI Agent System"
                else:
                    body = f"Hi,\n\nThis is an automated message regarding: {subject}.\n\nBest regards,\nssathiskumar641@gmail.com"

        # Split multiple recipients: "a@mail.com,b@mail.com,c@mail.com"
        recipients = [e.strip() for e in re.split(r'[,;\s]+', to_addr) if '@' in e and '.' in e]
        if not recipients:
            recipients = [to_addr]

        # Try real SMTP
        sent_list = []
        failed_list = []
        smtp_user = os.environ.get("SMTP_USER", "")
        smtp_pass = os.environ.get("SMTP_PASS", "")
        if smtp_user and smtp_pass:
            try:
                import smtplib
                from email.mime.text import MIMEText
                with smtplib.SMTP("smtp.gmail.com", 587) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    for addr in recipients:
                        try:
                            msg = MIMEText(body)
                            msg["Subject"] = subject
                            msg["From"] = smtp_user
                            msg["To"] = addr
                            server.send_message(msg)
                            sent_list.append(addr)
                            agent_log(f"   ✅ SENT → {addr}")
                            del msg
                        except Exception as e:
                            failed_list.append(addr)
                            agent_log(f"   ❌ FAILED → {addr}: {e}")
            except Exception as e:
                agent_log(f"   ⚠️ SMTP connection failed: {e}")
                failed_list = recipients

        existing = memory.get("chat_response", "")
        if sent_list:
            to_display = ", ".join(sent_list)
            result = f"📧 **Email ✅ Sent to {len(sent_list)} recipient(s)**\n\n**To:** {to_display}\n**Subject:** {subject}\n\n---\n{body}"
            if failed_list:
                result += f"\n\n⚠️ Failed: {', '.join(failed_list)}"
        else:
            to_display = ", ".join(recipients)
            result = f"📧 **Email 📨 Simulated**\n\n**To:** {to_display}\n**Subject:** {subject}\n\n---\n{body}"
        memory.set("chat_response", f"{existing}\n\n{result}".strip() if existing else result)
        memory.log_ai("Email", "SMTP Engine")



# ================================================================
#  AGENT 6: SEARCH — Web Intelligence
# ================================================================

class SearchAgent:
    def execute(self, memory, params):
        query = params.get("query", memory.get("prompt"))
        gk = memory.get("gemini_key")
        agent_log(f"\n{'='*50}")
        agent_log(f"🔍 SEARCH AGENT: '{query[:60]}...'")
        agent_log(f"{'='*50}")

        results = None

        # Priority 1: SerpAPI (real Google search results)
        serp_key = os.environ.get("SERPAPI_KEY", "")
        if serp_key and "your_" not in serp_key:
            try:
                search_url = f"https://serpapi.com/search.json?q={urllib.parse.quote(query)}&api_key={serp_key}&num=5"
                req = urllib.request.Request(search_url)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode())
                    organic = data.get("organic_results", [])[:5]
                    parts = []
                    for r in organic:
                        title = r.get('title', '')
                        snippet = r.get('snippet', '')
                        link = r.get('link', '')
                        parts.append(f"**{title}**\n{snippet}\n[{link}]({link})")
                    if parts:
                        results = "\n\n---\n\n".join(parts)
                    agent_log(f"   ✅ SerpAPI: {len(organic)} results")
            except Exception as e:
                agent_log(f"   ⚠️ SerpAPI failed: {e}")

        # Priority 2: Gemini knowledge fallback
        if not results:
            agent_log("   Using Gemini knowledge-based search...")
            results = ask_gemini(query, gk,
                "You are a search engine. Provide accurate, up-to-date, structured information with bullet points and clear sections.")

        existing = memory.get("chat_response", "")
        result = f"🔍 **Search:** *{query}*\n\n{results or 'No results found.'}"
        memory.set("chat_response", f"{existing}\n\n{result}".strip() if existing else result)
        memory.log_ai("Search", "Web Intelligence")


# ================================================================
#  MAIN ENTRY: Gemini Brain → Decision → Agents → Output
# ================================================================

ALL_AGENTS = {
    "chat": ChatAgent(),
    "image": ImageAgent(),
    "video": VideoAgent(),
    "email": EmailAgent(),
    "search": SearchAgent(),
}

def run_general_mode(memory):
    """Gemini analyzes prompt → decides agents → executes them. NO if-else."""
    prompt = memory.get("prompt")
    gk = memory.get("gemini_key")

    agent_log(f"\n{'='*60}")
    agent_log("🧠 GENERAL ORCHESTRATOR (Pure AI Reasoning)")
    agent_log(f"   Prompt: '{prompt[:80]}...'")
    agent_log(f"{'='*60}")

    # Step 1: Gemini decides which agents to call
    raw = ask_gemini(prompt, gk, ORCHESTRATOR_PROMPT)
    actions = []

    if raw:
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                decision = json.loads(json_match.group())
                actions = decision.get("actions", [])
                agent_log(f"   ✅ Gemini decided: {[a['agent'] for a in actions]}")
        except Exception as e:
            agent_log(f"   ⚠️ JSON parse failed: {e}")

    # Safety check: override Gemini if email addresses are in prompt but Gemini didn't pick email agent
    lp = prompt.lower()
    has_emails = re.findall(r'[\w.-]+@[\w.-]+\.\w+', lp)
    if has_emails and actions and not any(a.get("agent") == "email" for a in actions):
        if re.search(r'\b(send|email|mail)\b', lp):
            all_emails = ",".join(has_emails)
            actions = [{"agent": "email", "params": {"to": all_emails, "subject": "AI Message", "body": ""}}]
            agent_log(f"   🔧 Override: Gemini missed email — forcing Email agent ({len(has_emails)} recipients)")

    # Fallback: Smart regex routing when Gemini is unavailable (429/timeout)
    if not actions:
        agent_log("   ⚠️ Gemini unavailable — using smart fallback routing...")
        # Email FIRST (highest priority when @ addresses are present)
        if re.search(r'[\w.-]+@[\w.-]+\.\w+', lp):
            all_emails = re.findall(r'[\w.-]+@[\w.-]+\.\w+', lp)
            to_str = ",".join(all_emails)
            actions = [{"agent": "email", "params": {"to": to_str, "subject": "AI Message", "body": ""}}]
            agent_log(f"   📧 Fallback → Email agent ({len(all_emails)} recipients)")
        # Video before Image (both share "create/generate" keywords)
        elif re.search(r'\b(video|animation|clip|animate)\b', lp):
            actions = [{"agent": "video", "params": {"prompt": prompt}}]
            agent_log("   🎬 Fallback → Video agent")
        elif re.search(r'\b(image|picture|photo|draw|paint|sketch|poster|logo|art|illustration)\b', lp) or \
           (re.search(r'\b(generate|create|make|draw)\b', lp) and re.search(r'\b(dog|cat|sunset|landscape|portrait|scenery|design)\b', lp)):
            actions = [{"agent": "image", "params": {"prompt": prompt}}]
            agent_log("   🎨 Fallback → Image agent")
        elif re.search(r'\b(search|google|latest|news|weather|stock|current|today)\b', lp):
            actions = [{"agent": "search", "params": {"query": prompt}}]
            agent_log("   🔍 Fallback → Search agent")
        else:
            actions = [{"agent": "chat", "params": {"prompt": prompt}}]
            agent_log("   💬 Fallback → Chat agent")

    memory.log_ai("Orchestrator", "Decision Engine")

    # Step 2: Execute each agent
    for action in actions:
        agent_name = action.get("agent", "chat")
        params = action.get("params", {})

        if agent_name in ALL_AGENTS:
            agent_log(f"\n   → Dispatching: {agent_name.upper()}")
            try:
                ALL_AGENTS[agent_name].execute(memory, params)
            except Exception as e:
                agent_log(f"   ❌ {agent_name} error: {e}")
        else:
            agent_log(f"   ⚠️ Unknown agent '{agent_name}', skipping")

    memory.set("task_type", "general_multi_agent")
