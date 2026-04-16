import models from "../config/models.js";

export default function handel(modelId) {
  if (modelId < 0 || modelId > models.length) {
    console.error('please choose valid modelId');
    process.exit(1);
  }

  process.env.DEFAULT_AI_MODEL = models[modelId - 1].id
}