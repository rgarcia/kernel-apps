export interface SecretStore {
  getSecret(secretName: string): string | undefined;
  setSecret(secretName: string, value: string): void;
  hasSecret(secretName: string): boolean;
}

export class InMemorySecretStore implements SecretStore {
  private readonly nameToValue = new Map<string, string>();

  private normalizeSecretName(secretName: string): string {
    return secretName.startsWith('$') ? secretName.slice(1) : secretName;
  }

  getSecret(secretName: string): string | undefined {
    const normalized = this.normalizeSecretName(secretName);
    return this.nameToValue.get(normalized);
  }

  setSecret(secretName: string, value: string): void {
    const normalized = this.normalizeSecretName(secretName);
    this.nameToValue.set(normalized, value);
  }

  hasSecret(secretName: string): boolean {
    const normalized = this.normalizeSecretName(secretName);
    return this.nameToValue.has(normalized);
  }
}

export function isSecretReference(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.startsWith('$') && value.length > 1;
}

export function resolveSecretMaybe(value: string, store: SecretStore): string {
  if (!isSecretReference(value)) {
    return value;
  }
  const name = value.slice(1);
  const secret = store.getSecret(name);
  if (typeof secret !== 'string') {
    throw new Error(`Secret ${name} is not set in the SecretStore`);
  }
  return secret;
}


