import { scrubString, truncateString } from "../utils/Sanitizer.js";

const MAX_ERROR_CHARS = 1024;

export function presence(value: unknown): string {
  return value ? '[SET]' : '[NOT SET]';
}

export function buildDiagnoseEnvInfo(env: Record<string, any> = process.env as any): Record<string, string> {
  return {
    OPENCODE: presence(env.OPENCODE),
    OPENCODE_CLIENT: presence(env.OPENCODE_CLIENT),
    OPENCODE_SERVER_PASSWORD: presence(env.OPENCODE_SERVER_PASSWORD),
    OPENCODE_SERVER_USERNAME: presence(env.OPENCODE_SERVER_USERNAME),
    OPENCODE_API_KEY: presence(env.OPENCODE_API_KEY),
  };
}

export async function buildDiagnoseClientInfo(client: any, sessionID?: string): Promise<Record<string, any>> {
  const clientInfo: Record<string, any> = {
    hasClient: !!client,
    clientType: typeof client,
    clientKeys: client ? Object.keys(client).slice(0, 20) : [],
  };

  if (!client) return clientInfo;

  clientInfo.hasSession = !!client.session;
  if (client.session) {
    clientInfo.sessionKeys = Object.keys(client.session).slice(0, 20);
    clientInfo.hasPrompt = typeof client.session.prompt === 'function';
    clientInfo.hasCreate = typeof client.session.create === 'function';
    clientInfo.hasDelete = typeof client.session.delete === 'function';
  }

  clientInfo.hasApp = !!client.app;
  if (client.app) {
    clientInfo.appKeys = Object.keys(client.app).slice(0, 20);
  }

  if (typeof client.getConfig === 'function') {
    try {
      const cfg = client.getConfig();
      clientInfo.clientConfig = {
        hasConfig: !!cfg,
        baseUrl: cfg?.baseUrl,
        hasHeaders: !!cfg?.headers,
      };
    } catch (e: any) {
      const rawMessage = e?.message || String(e);
      clientInfo.getConfigError = truncateString(scrubString(rawMessage), MAX_ERROR_CHARS);
    }
  }

  clientInfo.testCall = { status: 'pending' };
  try {
    if (client.session?.create) {
      const testRes = await client.session.create({
        body: { parentID: sessionID || 'test', title: 'Diagnose: test-call' },
      });

      const hasError = !!testRes?.error;
      clientInfo.testCall = {
        status: 'completed',
        hasData: !!testRes?.data,
        hasError,
        errorMessage: hasError
          ? truncateString(
              scrubString(testRes?.error?.message || String(testRes?.error)),
              MAX_ERROR_CHARS
            )
          : undefined,
        responseKeys: testRes ? Object.keys(testRes).slice(0, 10) : [],
      };

      if (testRes?.data?.id && client.session?.delete) {
        try {
          await client.session.delete({ path: { id: testRes.data.id } });
          clientInfo.testCall.cleanedUp = true;
        } catch {
          clientInfo.testCall.cleanedUp = false;
        }
      }
    } else {
      clientInfo.testCall = { status: 'skipped', reason: 'client.session.create not available' };
    }
  } catch (e: any) {
    clientInfo.testCall = {
      status: 'error',
      message: truncateString(scrubString(e?.message || String(e)), MAX_ERROR_CHARS),
      code: e?.code,
    };
  }

  return clientInfo;
}
