import OpenAI from "openai";

export async function analyzePlantImage({ imageUrl, plant, environment, question }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Snapshot retrieval still works, but server-side vision analysis is disabled."
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_VISION_MODEL || "gpt-5";

  const context = {
    plant: {
      id: plant.id,
      name: plant.name,
      strain: plant.strain,
      stage: plant.stage,
      day: plant.day,
      location: plant.location,
    },
    environment,
  };

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "You are inspecting a plant image for horticultural monitoring. Describe only visible evidence, separate observations from hypotheses, identify likely stress patterns if present, and suggest low-risk checks. Do not claim certainty from an image alone.\n\n" +
              `Plant context: ${JSON.stringify(context)}\n\n` +
              `User question: ${question || "Assess visible plant health and notable changes."}`,
          },
          {
            type: "input_image",
            image_url: imageUrl,
          },
        ],
      },
    ],
  });

  return {
    model,
    text: response.output_text,
  };
}
