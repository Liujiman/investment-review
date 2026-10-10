import fixed from "../../public/samples/demo-case.json";
import { datasetSchema, type Dataset } from "./domain/schema";

export function loadDemo(): Dataset {
  return datasetSchema.parse(structuredClone(fixed));
}
