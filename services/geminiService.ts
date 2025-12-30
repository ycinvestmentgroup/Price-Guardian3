import { GoogleGenAI, Type } from "@google/genai";

export const extractInvoiceData = async (base64Data: string, mimeType: string = 'application/pdf') => {
  // Ensure we use the latest recommended model for complex text tasks
  const model = 'gemini-3-flash-preview';
  
  // The API key is injected by Vite's define config from the environment
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key is not configured. Please add 'API_KEY' to your Vercel Environment Variables.");
  }

  // Initialize inside the function to ensure we catch potential init issues
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'application/pdf',
              data: base64Data,
            },
          },
          {
            text: `Audit this procurement document. Extract exactly into the specified JSON format.
            Rules:
            1. Supplier Name: Extract the official business name.
            2. Line Items: Extract name, quantity, unit price, and subtotal for every row in the table.
            3. Totals: Capture GST (tax) and the final Grand Total.
            4. Metadata: Invoice number, date (YYYY-MM-DD), and due date (YYYY-MM-DD).
            5. If a field is missing, use null for strings and 0 for numbers.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 1024 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            docType: { 
              type: Type.STRING, 
              description: "Must be one of: 'invoice', 'credit_note', 'debit_note', 'quote'" 
            },
            supplierName: { type: Type.STRING },
            date: { type: Type.STRING },
            dueDate: { type: Type.STRING },
            invoiceNumber: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            gstAmount: { type: Type.NUMBER },
            address: { type: Type.STRING },
            abn: { type: Type.STRING },
            tel: { type: Type.STRING },
            email: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  total: { type: Type.NUMBER },
                },
                required: ["name", "quantity", "unitPrice", "total"],
              },
            },
          },
          required: ["docType", "supplierName", "date", "dueDate", "invoiceNumber", "totalAmount", "items"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("The AI failed to return readable data from this document.");
    }

    return JSON.parse(resultText);
  } catch (error: any) {
    console.error("Gemini Extraction Error:", error);
    if (error.message?.includes('403')) {
      throw new Error("Access Denied: Check if your Gemini API key is active and has permissions.");
    }
    throw new Error(error.message || "Auditing failed due to a network or parsing error.");
  }
};