
import { createGenerator } from "ts-json-schema-generator";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    path: "src/config/schema.ts",
    tsconfig: "tsconfig.json",
    type: "GroupDiscussConfig", // The root type
};

const outputPath = path.resolve(__dirname, "../group-discuss.schema.json");

try {
    const schema = createGenerator(config).createSchema(config.type);
    const schemaString = JSON.stringify(schema, null, 2);
    fs.writeFileSync(outputPath, schemaString);
    console.log(`Schema generated successfully at ${outputPath}`);
} catch (error) {
    console.error("Error generating schema:", error);
    process.exit(1);
}
