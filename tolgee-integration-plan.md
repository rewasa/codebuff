# Tolgee Integration Plan

## Ziele

1. **Text-Suche**: Nutze Tolgee API um nach spezifischen Texten in Übersetzungen zu suchen
2. **Übersetzungsmanagement**: Erfasse und verwalte Übersetzungen über Tolgee API
3. **Sichere API-Key Nutzung**: Verwende den in Infisical gespeicherten Tolgee API-Key

## Architektur

### 1. Backend Integration (Node.js/TypeScript)

**Neue Dateien erstellen:**
- `backend/src/services/tolgee-service.ts` - Tolgee API Client
- `backend/src/tools/handlers/tolgee-search.ts` - Tool für Textsuche
- `backend/src/tools/handlers/tolgee-manage.ts` - Tool für Übersetzungsmanagement
- `backend/src/tools/definitions/tolgee-tools.ts` - Tool-Definitionen

**Environment Variables:**
- `TOLGEE_API_KEY` in Infisical hinzufügen
- `TOLGEE_API_URL` (standardmäßig: https://app.tolgee.io)
- `TOLGEE_PROJECT_ID` für das Projekt

### 2. Tolgee Service Implementation

```typescript
class TolgeeService {
  private apiKey: string;
  private apiUrl: string;
  private projectId: string;

  // Methoden:
  async searchTranslations(query: string): Promise<SearchResult[]>
  async getTranslations(languageTag?: string): Promise<Translation[]>
  async createTranslation(key: string, translations: Record<string, string>): Promise<void>
  async updateTranslation(key: string, languageTag: string, value: string): Promise<void>
  async deleteTranslation(key: string): Promise<void>
  async exportProject(format: 'json' | 'csv'): Promise<string>
}
```

### 3. Tools für Buffy

**Text-Suche Tool:**
```typescript
// Ermöglicht Suche nach Texten in Übersetzungen
{
  toolName: 'tolgee_search',
  description: 'Search for text in translations using Tolgee API',
  input: {
    query: string,
    language?: string
  }
}
```

**Übersetzungsmanagement Tool:**
```typescript
// Erstelle, aktualisiere, lösche Übersetzungen
{
  toolName: 'tolgee_manage',
  description: 'Manage translations via Tolgee API',
  input: {
    action: 'create' | 'update' | 'delete' | 'export',
    key?: string,
    translations?: Record<string, string>,
    language?: string,
    value?: string
  }
}
```

### 4. Environment Setup

**In `packages/internal/src/env.ts` hinzufügen:**
```typescript
server: {
  // ... existing vars
  TOLGEE_API_KEY: z.string().min(1),
  TOLGEE_API_URL: z.string().url().default('https://app.tolgee.io'),
  TOLGEE_PROJECT_ID: z.string().min(1),
}
```

### 5. Agent Integration

**Neuer Spezialist-Agent:**
- `tolgee-specialist.ts` - Agent speziell für Übersetzungsmanagement
- Kann automatisch Texte extrahieren und in Tolgee hochladen
- Unterstützt Bulk-Operationen für große Textmengen

## Implementation Schritte

1. **Environment Variables Setup**
   - API-Key in Infisical hinzufügen
   - `env.ts` erweitern

2. **Tolgee Service erstellen**
   - HTTP Client für Tolgee REST API
   - TypeScript Interfaces für API Responses
   - Error Handling und Retry Logic

3. **Tools implementieren**
   - Search Tool für Textsuche
   - Management Tool für CRUD Operationen
   - Tool Definitionen registrieren

4. **Agent erstellen** (optional)
   - Spezialist für komplexe Übersetzungsaufgaben
   - Integration in spawnable agents Liste

5. **Testing**
   - Unit Tests für Service
   - Integration Tests für Tools
   - E2E Tests mit echtem Tolgee Projekt

## Nutzungsbeispiele

**Text suchen:**
```bash
codebuff "Suche nach 'Login' in allen Übersetzungen"
# Buffy nutzt tolgee_search tool
```

**Übersetzung hinzufügen:**
```bash
codebuff "Füge neue Übersetzung hinzu: 'welcome.title' mit DE: 'Willkommen' und EN: 'Welcome'"
# Buffy nutzt tolgee_manage tool
```

**Bulk Export:**
```bash
codebuff "Exportiere alle Übersetzungen als JSON"
# Buffy nutzt tolgee_manage tool mit export action
```

## Sicherheitsüberlegungen

- API-Key niemals in Code committen
- Nur über Infisical laden
- Rate Limiting für API Calls beachten
- Fehlerbehandlung für nicht autorisierte Zugriffe

## Benötigter Agent?

**Ja, empfohlen:** Ein spezialisierter `tolgee-specialist` Agent wäre sinnvoll für:
- Komplexe Übersetzungsworkflows
- Bulk-Operationen
- Integration mit bestehenden i18n Setups
- Automatische Erkennung von zu übersetzenden Texten im Code