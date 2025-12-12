import { getContextForQuery, getRealtimeClientSecret } from "@/generated";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { z } from "zod";

export async function startRealtime(bookId: number) {
  const bookContextTool = tool({
    name: "bookContext",
    description:
      "Retrieve relevant information from the book the user is currently reading based on their question. Use this tool when the user asks a question about the book to get the specific context needed to provide an accurate and helpful answer.",
    parameters: z.object({
      queryText: z.string(),
    }),
    execute: async ({ queryText }) => {
      const context = await getContextForQuery({
        bookId,
        queryText,
        k: 3,
      });
      return context;
    },
  });

  const agent = new RealtimeAgent({
    name: "Assistant",
    instructions:
      "You are a teacher and educational assistant whose role is to help the user understand the book they are reading. When the user asks a question about the book, use the bookContext tool to retrieve relevant information from the book, then provide a clear, simplified explanation that helps them better understand the content. Your goal is to make complex concepts accessible and answer questions in a way that enhances their comprehension of the material. When you are about to execute the bookContext tool, announce it to the user (e.g., 'Let me look that up in the book for you' or 'Let me find the relevant passage'). While the tool is executing, say phrases to buy time and keep the conversation flowing naturally (e.g., 'Let me check...', 'Searching through the book...', 'Finding the right section...').",
    tools: [bookContextTool],
  });

  const session = new RealtimeSession(agent);
  const apiKey = await getRealtimeClientSecret();

  // Automatically connects your microphone and audio output
  await session.connect({
    apiKey,
  });
  return session;
}
