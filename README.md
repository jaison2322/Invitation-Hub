# 👑 Invitation Hub

A mobile-first, AI-powered invitation intelligence, relationship memory, and VIP event scheduling application built with React, TypeScript, Vite, and Tesseract OCR.

---

## 🌟 Overview

Extremely busy VIPs, executives, business leaders, and celebrities receive hundreds of invitations from relatives, partners, clients, and social contacts. They often struggle with overlapping schedules and forgetting critical reciprocal relationship contexts (e.g. *"Did Ramesh attend my daughter's wedding? What gift did he give?"*).

**Invitation Hub** transforms the chaotic invitation process into a 10-second decision:
> **Scan Invitation → AI extracts details & matches historical relationship records → VIP chooses CONFIRM or IGNORE.**

---

## 🚀 Key Features

### 1. 📷 AI Invitation Scanner (OCR + Extraction)
- **Multi-Modal Capture**: Camera photo capture, gallery image upload, and sample demo invitation modes.
- **In-Browser OCR**: Powered by Tesseract.js WebAssembly.
- **Intelligent Field Extraction**: Extracts Event Type, Person/Couple Name, Host Name, Date, Time, Venue, and Location with confidence meters and inline correction.

### 2. 🏷️ Custom Nickname / Identity System
- Assigns context-rich nicknames (e.g., `Business Partner Ramesh — Daughter's Wedding`) rather than unfamiliar couple names.

### 3. 🧠 Reciprocal Relationship & Gift Memory Vault
- Maintains an immutable historical memory of past family functions (weddings, engagements, housewarmings).
- Stores guest attendance, gift descriptions, categories (Gold, Silver, Cash, etc.), and values.
- Automatically connects incoming invitations to the person's historical profile.

### 4. ⚖️ Deterministic AI Priority Engine
- Calculates weighted priority (**High / Medium / Low**) using relationship depth, past event attendance, reciprocal gift value (e.g. ₹65,000 Gold Coin), and schedule overlap.
- Generates human-readable rationales while keeping the VIP in full control.

### 5. ⚡ Confirm or Ignore Workflow
- Streamlines complex decisions into a single screen displaying:
  - Event summary & venue details
  - AI suggested priority + reasoning
  - Complete relationship history timeline
  - Past gift records & value
  - Schedule conflict warnings
  - **1-Tap CONFIRM or IGNORE actions**

### 6. 📅 Schedule Awareness & Conflict Center
- Detects overlapping meetings and same-day event clusters.
- Visual side-by-side timeline with AI resolution strategy.

### 7. ⏰ VIP 7-Day Countdown Reminder Center
- Prioritized reminders starting 7 days before confirmed events with urgency color-coding.

### 8. 🛡️ Privileged User & Permission Control
- Strict 5-user access limit for Personal Assistants (PA), Secretaries, and Family Members.
- Granular permission switches (Add Invitations, Edit Events, Change Priority, Manage Schedule, View Gift History, Add People).
- Complete Audit History log with before/after diff tracking.

---

## 🛠️ Tech Stack

- **Framework**: React 18 / 19 + Vite + TypeScript
- **State Management**: Zustand with persistent storage
- **Styling**: Custom Design System with Dark Midnight Navy (`#060a13`), Radiant Gold (`#d4a853`), and multi-layer Glassmorphism (`backdrop-filter: blur(20px)`)
- **Typography**: Google Fonts Outfit & Inter
- **Icons**: Lucide React
- **OCR Engine**: Tesseract.js (WebAssembly)
- **Date Handling**: date-fns

---

## 🏃 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/jaison2322/VIP-Scheduling.git

# Navigate to project directory
cd VIP-Scheduling

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## 🔑 Demo PIN Credentials

| Role | Name | PIN | Access Level |
| :--- | :--- | :--- | :--- |
| **VIP Master** | Jaison (VIP) | `0000` | Full Master Access |
| **Personal Assistant** | Deepa | `1111` | Scan, Edit Events, Schedule |
| **Secretary** | Muthu | `2222` | Scan Invitations, Schedule |

---

## 📄 License
MIT License
