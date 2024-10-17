// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { Document, Packer, Paragraph, TextRun } = require('docx'); // For DOCX parsing
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Define the custom prompt
chunking_quiz_prompt =`
You are a chunking expert specializing in breaking down educational materials into manageable, cognitively efficient pieces. Given an input document, follow the chunking guidelines below to break each chapter into appropriate chunks based on content type, structure, and cognitive load.

For each chapter:
1. **Analyze the chapter’s structure**: Focus on sections and subsections of the uploaded file and only provide information derived from it.
2. **Apply chunking rules based on content type**:
   - For **conceptual content**, group related ideas or topics into manageable sections.
   - For **procedural content**, chunk step-by-step instructions or processes.
   - For **mixed content**, ensure each section’s concepts, examples, and visuals are treated as individual chunks.
3. **Use visual or logical breaks**: Utilize headings, subheadings, or bullet points to clearly define each chunk.
4. **Conciseness and clarity**: Ensure each chunk is concise and coherent. The summarized content should be explained in simpler, understandable terms and be as exhaustive as possible.
5. **Miller's Law**: Use Miller's Law to ensure that each chunk contains between 5 to 9 main points, ideas, or concepts.
6. **Include a brief description**: At the beginning of each chunk, include a short, 5-word summary describing the chunk.
7. **Quiz generation**: At the end of each chapter, generate around 7 multiple-choice questions with three options and an answer based on the content covered in each chunk.

**Important**: Respond strictly in valid JSON format as follows:

 {
"title": "<Title>",
"subtitle": "<Subtitle>",
"summarizedContent": [
{
"chunk": "<Chunk N>",
"description": "<Short 5-word description>",
"content": "<Chunk content>"
}
],
"quiz": [
{
"question": "<Quiz question>",
"options": ["<Option 1>", "<Option 2>", "<Option 3>"],
"answer": "<Correct answer>"
}
]
}
`
// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
});

// Utility function to extract text from DOCX files
const extractTextFromDocx = async (buffer) => {
  const doc = await docx.Packer.toBuffer(Document.fromBuffer(buffer));
  // Note: For robust DOCX parsing, consider using 'docx' or 'docx-parser' packages
  // Here, we'll use a placeholder as 'docx' doesn't support direct text extraction
  // You might need to switch to 'docx4js' or another library for proper parsing
  return 'DOCX parsing not implemented.';
};

// API Endpoint to handle file upload and processing
app.post('/api/openai', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    let textContent = '';

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Determine file type and extract text accordingly
    if (file.mimetype === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      textContent = data.text;
    } else if (
      file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      // For DOCX files
      // Implement DOCX parsing or use a suitable library
      // Placeholder implementation:
      textContent = await extractTextFromDocx(file.buffer);
    } else if (file.mimetype === 'text/plain') {
      textContent = file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type.' });
    }

    if (!textContent.trim()) {
      return res.status(400).json({ error: 'Uploaded file is empty or unreadable.' });
    }

    // Combine the custom prompt with the extracted text
    const prompt = `${chunking_quiz_prompt}\n\n${textContent}`;

    // Make a request to OpenAI API
    const openaiApiKey = process.env.OPENAI_API_KEY;

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo', // Or 'gpt-4' if you have access
        messages: [
          { role: 'system', content: 'You are an assistant that formats responses in JSON.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 3000, // Adjust as needed
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
      }
    );

    // Extract the text response from OpenAI
    const aiText = openaiResponse.data.choices[0].message.content;

    // Attempt to parse the AI response as JSON
    let responseData;
    try {
      // Remove any leading/trailing whitespace
      const trimmedText = aiText.trim();

      // If the response is wrapped in a code block, remove it
      const codeBlockRegex = /^```json\s*([\s\S]*?)\s*```$/;
      const match = trimmedText.match(codeBlockRegex);
      if (match && match[1]) {
        responseData = JSON.parse(match[1]);
      } else {
        // Attempt to parse directly
        responseData = JSON.parse(trimmedText);
      }

      // Optionally, validate the structure of responseData here

      res.json(responseData);
    } catch (jsonError) {
      console.error('Failed to parse OpenAI response as JSON:', jsonError);
      console.error('Response text:', aiText);
      res.status(500).json({ error: 'Invalid JSON format from OpenAI.' });
    }
  } catch (error) {
    console.error('Internal server error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch OpenAI response.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
