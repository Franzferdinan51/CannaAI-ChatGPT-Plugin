import { readFile } from "node:fs/promises";

const plantsPath = new URL("../data/plants.json", import.meta.url);
const envPath = new URL("../data/environment.json", import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

export async function listPlants() {
  return readJson(plantsPath);
}

export async function getPlant(plantId) {
  const plants = await listPlants();
  return plants.find((plant) => plant.id === plantId) ?? null;
}

export async function getEnvironment(plantId) {
  const env = await readJson(envPath);
  return env[plantId] ?? null;
}

export async function getDashboardData(plantId) {
  const [plant, environment] = await Promise.all([
    getPlant(plantId),
    getEnvironment(plantId),
  ]);

  if (!plant) return null;
  return { plant, environment };
}
