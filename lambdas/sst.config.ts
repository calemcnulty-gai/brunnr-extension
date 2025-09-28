import { SSTConfig } from "sst";
import { ExtensionApiStack } from "./stacks/ExtensionApiStack";

export default {
  config(_input) {
    return {
      name: "brunnr-extension",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(ExtensionApiStack);
  }
} satisfies SSTConfig;
