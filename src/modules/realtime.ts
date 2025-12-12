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
      "You are a teacher and educational assistant whose role is to help the user understand the book they are reading. At the start of the conversation, greet the user and ask what you can help them with. When the user asks a question about the book, use the bookContext tool to retrieve relevant information from the book, then provide a clear, simplified explanation that helps them better understand the content. Your goal is to make complex concepts accessible and answer questions in a way that enhances their comprehension of the material. When you are about to execute the bookContext tool, briefly let the user know you're checking the book (e.g., 'Let me look that up in the book for you'). While the tool runs, keep responses concise and natural—no obvious stalling—just a short acknowledgement that you're fetching the answer.",
    tools: [bookContextTool],
  });

  const session = new RealtimeSession(agent);
  const apiKey = await getRealtimeClientSecret();

  // Automatically connects your microphone and audio output
  await session.connect({
    apiKey,
  });
  // Trigger an initial greeting so the assistant speaks first
  session.sendMessage({
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: "Please greet the user and ask what you can help with regarding the book they are reading.",
      },
    ],
  });
  return session;
}
