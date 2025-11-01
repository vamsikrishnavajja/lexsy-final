Lexsy – AI-Powered Legal Document Assistant

Lexsy is an AI-driven web application that automates the process of reviewing and completing legal documents.
It allows users to upload a .docx file, detect and fill placeholders through a conversational assistant, preview the completed document, and download the finalized version — providing a faster, smarter way to handle legal workflows.

Live Application

Frontend: https://lexsy-final.vercel.app￼
Backend: https://lexsy-final.onrender.com￼
Repository: https://github.com/vamsikrishnavajja/lexsy-final￼

Key Features
	•	Upload .docx legal templates.
	•	Automatically detect and highlight placeholders.
	•	Conversational assistant to fill dynamic fields.
	•	Validation for text, numeric, and date (MM-DD-YYYY) inputs.
	•	Real-time document preview during conversation.
	•	Download a completed .docx instantly.
	•	Works universally with various legal document formats.


Tech Stack:

Layer                                                        Tools
Frontend                                            React, TypeScript, Vite

Backend                                                 Node.js, Express

AI Integration                                            OpenAI API

File Processing                                      Mammoth, Docx, Multer

Hosting                                         Vercel (Frontend), Render (Backend)
  



Local Setup:

# Clone the repository
git clone https://github.com/vamsikrishnavajja/lexsy-final.git
cd lexsy-final

Backend

cd server
npm install
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
npm run dev

Frontend

cd web
npm install
echo "VITE_API_BASE=http://localhost:5000" > .env
npm run dev



Vamsi Krishna Vajja
Master’s in Computer Science – University of Maryland, Baltimore County
AI and Full-Stack Developer
Email: vamsikvajja@gmail.com￼
GitHub: https://github.com/vamsikrishnavajja￼
