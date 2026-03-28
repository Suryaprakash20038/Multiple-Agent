# 🌊 Multi-Agent Swarm Flow Diagram

இந்த வரைபடம் நமது சிஸ்டம் எப்படி ஆரம்பம் முதல் முடிவு வரை (End-to-End) இயங்குகிறது என்பதை விளக்குகிறது.

```mermaid
graph TD
    %% Base Styles
    classDef user fill:#e8d5f5,stroke:#9333ea,stroke-width:2px,color:#000
    classDef bridge fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#000
    classDef brain fill:#dcfce7,stroke:#16a34a,stroke-width:3px,color:#000,font-weight:bold
    classDef agent fill:#f0fdf4,stroke:#16a34a,stroke-width:1px,color:#000
    classDef creative fill:#fdf2f8,stroke:#db2777,stroke-width:2px,color:#000
    classDef db fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#000

    %% Nodes
    User((👤 User Prompt)):::user
    FE[React UI Dashboard]:::user
    Node[Node.js Express Server]:::bridge
    PythonBridge{Python Bridge <br/> system.py}:::bridge
    
    %% Main Routing
    User --> FE
    FE -->|Axios POST| Node
    Node -->|execFile| PythonBridge
    
    %% Swarm Logic
    subgraph "🤖 AI SWARM INTELLIGENCE"
        Memory[(Hybrid Shared Memory)]:::brain
        PythonBridge -->|Initialize| Memory
        
        subgraph "Mode: QUERY (Developer Hub)"
            P[🧠 Planner <br/> Gemini]:::agent
            C[👨‍💻 Coder <br/> Claude/Gemini]:::agent
            T[🧪 Tester <br/> GPT/Gemini]:::agent
            D[⚙️ DevOps <br/> Git CLI]:::agent
            
            P -.->|Task Type| Memory
            C -.->|SQL Code| Memory
            T -.->|Validation| Memory
            D -.->|Commit Hash| Memory
            
            P --> C --> T --> D
        end
        
        subgraph "Mode: GENERAL (Genius Hub)"
            O[🧠 Orchestrator <br/> Gemini Brain]:::creative
            Chat[💬 Chat Agent]:::creative
            Img[🎨 Image Agent]:::creative
            Vid[🎬 Video Agent]:::creative
            Mail[📧 Email Agent]:::creative
            Search[🔍 Search Agent]:::creative
            
            O --> Chat & Img & Vid & Mail & Search
        end
    end
    
    %% Final Actions
    D -->|Execute SQL| PostG[(🗄️ PostgreSQL)]:::db
    PostG --> Final[✨ Final Visual Response]:::brain
    Chat & Img & Vid & Mail & Search --> Final
    
    %% Return Trip
    Final -->|Base64 JSON| Node
    Node -->|Data + UI Results| FE
    FE -->|WOW Experience| User
```

---

### 🗝️ முக்கிய குறிப்புகள் (Key Features):
1.  **Shared Memory**: எல்லா ஏஜென்ட்டுகளும் ஒரே 'Memory' நோட்புக்கை பயன்படுத்துகின்றன.
2.  **Autonomous Decision**: எந்த ஏஜென்ட் எப்போது வேலை செய்ய வேண்டும் என்பதை Gemini Brain முடிவு செய்கிறது.
3.  **Cross-Platform**: Node.js (Backend) மற்றும் Python (AI) இரண்டும் இணைந்து இயங்குகின்றன.
4.  **Real-Time Media**: படங்கள், வீடியோக்கள் மற்றும் ஈமெயில்கள் ஒரே நேரத்தில் உருவாக்கப்படுகின்றன.
