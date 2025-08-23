# 🧠 LLM-Friendly Documentation Guide

## Why It Matters

Your next developer might be an AI — or future-you. Whether you're working solo or collaborating with others, writing code that's easy for large language models (LLMs) to understand leads to faster, better, and safer outcomes.

---

## ✅ Core Principles

### 1\. Document for a Non-Human Reader

LLMs don’t have shared memory or your past discussions. They only "see" what’s in the file or prompt. Make that context count.

### 2\. Prefer Explicit Over Implicit

LLMs can't guess how your function connects to others unless you tell them. List where things are used or called.

### 3\. Use Language-Specific Doc Comments

Use the formal docstring style your language supports:

| Language | Style |
| :---- | :---- |
| JavaScript / TypeScript | `/** */` |
| Python | \`\` |
| Swift | `///` |
| Go | `//` before the function |
| JSON | Use adjacent Markdown or comments in linked docs |

---

## 📦 Recommended Patterns

### 🧾 Function Docstring Template

/\*\*

 \* \[What the function does\]

 \*

 \* Used by:

 \* \- \[filename.ts \-\> functionName()\]

 \* \- \[anotherFile.ts \-\> anotherFunction()\]

 \*

 \* Calls:

 \* \- \[someHelperFunction()\]

 \*

 \* Returns:

 \* \- \[What the result looks like\]

 \*/

### 📄 File Header Template

// File: insertSubscriber.js

// Description: Inserts a subscriber into Supabase with address, email, and OCD IDs

// Used by: signupForm.tsx, importCsvTool.js

---

## 🧮 Magic Numbers → Named Constants

// ❌ Bad

setTimeout(() \=\> doThing(), 3000);

// ✅ Good

const PAGE\_LOAD\_DELAY\_MS \= 3000; // Wait for page JavaScript to initialize

setTimeout(() \=\> doThing(), PAGE\_LOAD\_DELAY\_MS);

---

## 🧠 State Variables

Clearly document:

- Default value  
- When/how it changes  
- Why it exists

/\*\*

 \* Tracks whether user has submitted a prompt in this session.

 \* 

 \* \- Defaults to true on load

 \* \- Set to false after first prompt

 \* \- Used to switch between new vs reply behaviors

 \*/

let isFirstPrompt \= true;

---

## 🧩 Error Handling Documentation

Be clear about:

- What might fail  
- How it's handled or bubbled  
- What the caller should do

---

## 🔧 Environment Variable Management

### **Critical Best Practices**

Environment variables are the most common source of runtime failures. Document them thoroughly:

\# ❌ Bad \- No documentation

SENDGRID\_API\_KEY=SG.abc123...

\# ✅ Good \- Documented with validation

\# SendGrid API Key \- Must start with "SG." and be on single line

\# Get from: https://app.sendgrid.com/settings/api\_keys

SENDGRID\_API\_KEY=SG.abc123...

### **Environment File Validation**

Always include validation scripts for critical environment variables:

// validateEnv.js

function validateEnv() {

  const required \= \['SUPABASE\_URL', 'SENDGRID\_API\_KEY', 'GEOCODIO\_API\_KEY'\];

  const missing \= required.filter(key \=\> \!process.env\[key\]);

  

  if (missing.length \> 0\) {

    throw new Error(\`Missing required environment variables: ${missing.join(', ')}\`);

  }

  

  // Validate specific formats

  if (\!process.env.SENDGRID\_API\_KEY?.startsWith('SG.')) {

    throw new Error('SENDGRID\_API\_KEY must start with "SG."');

  }

}

### **Common Environment Issues & Solutions**

Document the troubleshooting steps for your specific setup:

\#\# Environment Variable Troubleshooting

\#\#\# SendGrid API Key Issues

\*\*Symptoms:\*\* \`API key does not start with "SG."\`

\*\*Causes:\*\* 

\- Line breaks in .env file

\- Shell commands accidentally written to file

\- Duplicate .env files

\*\*Solutions:\*\*

1\. Check for corruption: \`cat .env | head \-5\`

2\. Verify single-line format: \`grep "SENDGRID\_API\_KEY" .env\`

3\. Test loading: \`node \-e "console.log(process.env.SENDGRID\_API\_KEY?.substring(0,10))"\`

---

## 📚 Documentation Maintenance

---

## 🔗 Cross-References

LLMs can't load 20 files at once. Mention what this function talks to — even if indirectly.

/\*\*

 \* Submits prompt text to all services.

 \*

 \* Called by:

 \* \- promptWindow.ts (submit button)

 \*

 \* Dispatches to:

 \* \- claudeService.send()

 \* \- chatGptService.send()

 \*/

\#\#\# File Headers  
At the top of each file, include a short comment with:  
\- Purpose of the file  
\- Who/what calls it  
\- Any feature flags that guard its usage

\#\#\# State Variables  
Document all stateful values with:  
\- Default value  
\- Allowed transitions  
\- Purpose in the workflow

\#\#\# Constants  
Replace magic numbers and strings with named constants.  
\- Example: \`const MAX\_RETRIES \= 3\` instead of \`for (let i \= 0; i \< 3; i++)\`.

\#\#\# Feature Flags  
Document any \`FEATURE\_\*\` flags at the top of the file. Note what functionality is gated and default state.

\#\#\# Idempotency & Logging  
For external calls (e.g., SendGrid, Supabase mutations), document:  
\- Idempotency strategy (how it avoids duplicates)  
\- What gets logged before/after provider calls

---

## ✨ Final Tip: Clarity Beats Cleverness

Verbose and obvious \> terse and magical. LLMs perform better with clear naming and spacing.  
