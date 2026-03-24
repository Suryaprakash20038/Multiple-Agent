# 🌙 Premium React Dark Mode

A sleek, autonomous dark mode implementation feature with React. This project demonstrates a production-ready theme switching system built by an AI autonomous engineering team.

## ✨ Features
*   **Context API Powered State**: Global theme state available anywhere.
*   **LocalStorage Persistence**: Automatically remembers your preference.
*   **FOUC Prevention**: Custom script in `index.html` prevents flashing white screen on refresh.
*   **System Preference Sync**: Automatically detects and adapts to OS dark/light mode switches.
*   **Premium Aesthetics**: Modern HSL-based color palette with glassmorphism (slate and indigo).

## 🚀 Getting Started

1.  **Clone & Install**:
    ```bash
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## 📂 Architecture
*   `src/context/ThemeContext.jsx`: Core switching and storage logic.
*   `src/index.css`: Global CSS variables for `--bg-color`, `--text-color`, etc.
*   `index.html`: Pre-load script for performance.

---
Built by **Antigravity AI Engineering Team**.
