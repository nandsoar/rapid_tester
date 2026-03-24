## Features
- [ ] field auto completion given database
- [ ] image optimizations and previews
- [ ] auto-complete sql tables
- [ ] integrate with the code base for full autocompletion

- [ ] document wide data
- [ ] swithcing iterations while in preview
- [ ] lost formatting
- [ ] copy iteration

-- priority
- move around scenario parameters
- code blocks parsing
- insert image into statement


---

[SQL] Run a Workload Balancing update and make sure it is logged.

    ```sql
    EXEC lsp_GovSetOrderTypeTarget @TargetsExternallyManaged = 1, @OrderType = 'GT', @NewValue = '100';
    select * from sysproperty where Keyword like '%nio%'
    ```



### 1. Work Item Import → Autopopulate Header
- Import ADO work items (JSON from REST API or pasted)
- Parse and map ADO fields to header fields (title, assignee, environment, build, etc.)
- Field mapping defined in the template so each template knows which ADO fields go where
- Start screen offers "Import Work Item" flow: paste/upload JSON → auto-fill header → open editor

### 2. Autocomplete Suggestions
- `AutocompleteDictionary` in each template: maps field keys to arrays of known terms
  - e.g. `"testEnvironment": ["Staging", "Production", "UAT", "Dev"]`
- `AutocompleteInput` component wraps text inputs with filtered dropdown as you type
- User-extensible: new values can be saved to the dictionary (persisted in localStorage)

### 3. Template File System
- Evolve `DEFAULT_TEMPLATE` into a full template system
- Each template includes: header fields, scenario fields, autocomplete sets, work item field mapping, formatting rules, document type
- Templates importable/exportable as `.rt-template.json` files
- Stored in localStorage with import/export to file as option

### 4. Start Screen Rework
- Replace simple "New Document" button with a proper creation flow
- **"Import Work Item"** — paste/upload ADO JSON → select template → auto-fill → editor
- **"Blank Document"** — select template → editor with empty fields
- Future sub-types: "Test Document" (test cases section), "New Work Item" (other fields)
