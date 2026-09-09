// Deliberately register only the LLM engine used for extraction and drafting.
import { initializeWorkerCore, ensureRPCSetup } from '@qvac/sdk/worker-core';
import { registerPlugins } from '@qvac/sdk/plugins';
import { llmPlugin } from '@qvac/sdk/llamacpp-completion/plugin';
const { hasRPCConfig } = initializeWorkerCore();
registerPlugins([llmPlugin]);
if (hasRPCConfig) ensureRPCSetup();
