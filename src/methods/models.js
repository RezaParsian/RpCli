import models from "../config/models.js";

export default function handel() {
  console.log()

  models.forEach((model, index) => {
    console.log(index + 1, model.name);
  })
}