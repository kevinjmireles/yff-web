# 🧼 Cursor Chat Hygiene Checklist

### ✅ Start a New Chat When
- **New Feature or PR**  
  - e.g. *“Implement `/api/send/execute` route”*  
  - e.g. *“Add test mode + cohort cap”*  

- **New Refactor**  
  - e.g. *“Clean up Supabase clients”*  
  - e.g. *“Simplify middleware & auth gate”*  

- **Switching Context / Subsystem**  
  - From *login bugs* → *sending pipeline*  
  - From *signup flow* → *content upload*  

- **Conversation is Too Long (>100–150 turns)**  
  - Fresh chats keep context focused & clean.  

- **Different Agent Role**  
  - Architect (design/plan)  
  - Implementer (build code)  
  - Reviewer (audit/test)

---

### 🚫 Stay in the Same Chat When
- Iterating on a single feature still in progress  
- Fixing small bugs directly related to the last change  
- Adjusting acceptance criteria or test cases for the same feature  

---

### 🎯 Best Practices
- **One chat = one feature/PR**  
- **Merge before switching chats** if possible  
- **Name chats clearly** in Cursor (e.g., `v2.1-execute-route`)  
- **Link related chats** in PR descriptions for traceability  

---

### 🧪 Benefits
- Cleaner reasoning (agents don’t get confused by old context)  
- Easier to review why decisions were made  
- Lower bug risk (no cross-contamination of instructions)  
- Reusable transcripts for docs & onboarding  
