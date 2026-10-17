// OpenAI function-calling tool schemas for the chat agent loop
// (POST /api/chat). Each entry's `name` maps to an implementation in
// runTool(): crm.ts (contacts/projects/notes/docs/events) or agent2.ts
// (tasks/list/ask_kb/email/calendar). Keep names stable — the model emits them.
export const TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "create_contact",
      description: "Create a new contact. Accepts one or more emails/phones. Use email/phone for a single default value, or emails[]/phones[] (each {value,label?,isDefault?}) for multiple. If the contact already exists it is updated instead.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          emails: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, isDefault: { type: "boolean" } } } },
          phones: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, isDefault: { type: "boolean" } } } },
          company: { type: "string" },
          role: { type: "string" },
          address: { type: "string" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Search contacts by name/company/email. ALWAYS call this before create/update/delete to avoid duplicates.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "update_contact",
      description: "Update fields of an existing contact. Use search_contacts first to get exact name if unsure. Pass only fields to change. To ADD another email/phone (keeping existing), pass emails[]/phones[] (merged, deduped). To set which one is default, include set_default_email or set_default_phone with the value.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name/email/phone to find the contact" },
          name: { type: "string" },
          email: { type: "string", description: "Replace the contact's email (single). Prefer emails[] to add without replacing." },
          phone: { type: "string", description: "Replace the contact's phone (single). Prefer phones[] to add without replacing." },
          emails: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, isDefault: { type: "boolean" } } }, description: "Additional emails to add/merge" },
          phones: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, isDefault: { type: "boolean" } } }, description: "Additional phones to add/merge" },
          set_default_email: { type: "string", description: "Set the default email to this value (must already belong to the contact)" },
          set_default_phone: { type: "string", description: "Set the default phone to this value (must already belong to the contact)" },
          company: { type: "string" },
          role: { type: "string" },
          address: { type: "string" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_contact",
      description: "Delete duplicate/wrong contact(s) by name, email, or id. ALWAYS call search_contacts first and confirm count. Use when user says delete/remove/merge duplicate.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, email, or id to match. Deletes ALL matches — be precise." },
          keep_one: { type: "boolean", description: "If true and multiple match, keep the oldest and delete the rest (dedupe)." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create ONE task with title, optional description/status/priority/due date (ISO), linked person/project. Status: todo|in-progress|done. Priority: low|medium|high.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["todo", "in-progress", "done"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          due_at: { type: "string" },
          contact_name: { type: "string" },
          project_title: { type: "string" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task's fields. query can be a title fragment OR 'that task'/'this task'/'it' to mean the most recent task in this conversation. Pass ONLY the fields to change.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Task title, or 'that task' for the recent one" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["todo", "in-progress", "done"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          due_at: { type: "string", description: "ISO date, 'tomorrow', 'the 20th', etc." },
          contact_name: { type: "string" },
          project_title: { type: "string" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "Update an existing note's title/body/links. query can be a title fragment or 'that note'. Pass ONLY fields to change.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          contact_name: { type: "string" },
          project_title: { type: "string" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark task(s) done by title search.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Create a NEW project. If a project with the same/similar title already exists, this links to it instead of creating a duplicate (see search_projects). Optionally link people by name, and set status/company/revenue fields. Revenue fields are in AED.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["planned", "active", "complete", "abandoned"] },
          company: { type: "string" },
          projected_revenue: { type: "number", description: "Expected revenue for the project, in AED." },
          revenue: { type: "number", description: "Money received so far, in AED." },
          expected_completion: { type: "string", description: "Target completion date (ISO date)." },
          poc_name: { type: "string", description: "Name of the Point of Contact (must be a linked person)." },
          contact_names: { type: "array", items: { type: "string" } }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_projects",
      description: "Search existing projects by title/company. ALWAYS call this BEFORE create_project when linking something to a project, to find the exact existing project and avoid duplicates.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_project",
      description: "Edit an existing project OR link tasks/notes/people to it. Use this for 'link X to project Y' requests — pass query (project title) plus one of task_query/note_query/contact_name, or fields to change (status/company/description/revenue). If the project title is ambiguous it will ask which one.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Project title/id to find" },
          new_title: { type: "string" },
          status: { type: "string", enum: ["planned", "active", "complete", "abandoned"] },
          company: { type: "string" },
          description: { type: "string" },
          inception_date: { type: "string", description: "ISO date to set as the project's inception date." },
          next_deadline: { type: "string", description: "ISO date to set as the project's next deadline (overrides the auto 'soonest task due')." },
          projected_revenue: { type: "number", description: "Expected revenue, in AED." },
          revenue: { type: "number", description: "Money received so far, in AED." },
          expected_completion: { type: "string", description: "Target completion date (ISO date)." },
          poc_name: { type: "string", description: "Set the Point of Contact to this person (must be a linked person)." },
          contact_name: { type: "string", description: "Person to link to the project" },
          task_query: { type: "string", description: "Task title to link to the project" },
          note_query: { type: "string", description: "Note title to link to the project" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_note",
      description: "Add ONE note with title + content, optionally linked to a person and/or project. Call at most once per user message.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          contact_name: { type: "string" },
          project_title: { type: "string" },
          via: { type: "string", enum: ["chat", "voice", "upload", "meeting", "email"] }
        },
        required: ["body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft an email and save it to the user's Titan Drafts folder for review (NEVER sends). Give the recipient via `to` (an email) OR `contact_name` (looked up in People), and EITHER compose `subject`+`body` yourself OR give a short `about` overview and the tool drafts it. Files the user attached to the chat message are attached automatically; also pass anything they name via `attachments` — a rough/descriptive name is fine (e.g. \"NVC Pitch Deck\"), the tool fuzzy-matches it against Files. Write NO sign-off or signature in the body — the user adds their Titan signature manually before sending. Use when the user says 'draft/write an email to X about Y'.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email, or a person's name to look up in People" },
          contact_name: { type: "string", description: "Person's name to resolve to an email via People" },
          subject: { type: "string", description: "Email subject line you compose" },
          body: { type: "string", description: "Full email body you compose (plain text, NO sign-off or signature — the user adds their Titan signature manually)" },
          about: { type: "string", description: "If subject/body omitted, a short overview of what the email should say" },
          attachments: { type: "array", items: { type: "string" }, description: "Files to attach: filenames, ids, or rough descriptive names (e.g. \"NVC Pitch Deck\") — fuzzy-matched against uploaded/CRM files. Chat-attached files are also picked up automatically." }
        },
        required: ["to"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Create a new event/meeting on the user's Titan calendar. Use for 'schedule/book/add a meeting or event ...'. Times as ISO datetimes with the CURRENT year (e.g. 2026-03-05T15:00:00). Guests can be names (looked up in People) or raw emails.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title" },
          start: { type: "string", description: "ISO datetime of the start" },
          end: { type: "string", description: "ISO datetime of the end (defaults to start + 1 hour)" },
          all_day: { type: "boolean" },
          location: { type: "string" },
          description: { type: "string" },
          meeting_link: { type: "string", description: "Video call URL (Zoom/Meet/etc.)" },
          guests: { type: "array", items: { type: "string" }, description: "Attendee names or email addresses" }
        },
        required: ["summary", "start"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description: "Edit an existing Titan calendar event. Use for 'move/reschedule the meeting to X', 'change the event location', 'add Y as a guest', 'rename the event'. ALWAYS know the exact event first (list_items kind=meetings) — pass its title in `query`. Pass ONLY fields to change. Guests[] REPLACES attendees unless replace_guests is false.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Event title (or uid fragment) to find" },
          summary: { type: "string" },
          start: { type: "string", description: "New ISO datetime start" },
          end: { type: "string", description: "New ISO datetime end" },
          all_day: { type: "boolean" },
          location: { type: "string" },
          description: { type: "string" },
          meeting_link: { type: "string" },
          guests: { type: "array", items: { type: "string" } },
          replace_guests: { type: "boolean", description: "true = replace the guest list; false/omitted = merge into existing" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_note",
      description: "Read full note(s) by exact title or keyword. Returns title, full content, linked person/project, dates. Use when user asks 'what does note X say', 'read Preferences', 'latest note'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Title or keyword; 'latest' returns the newest note" },
          contact_name: { type: "string" },
          project_title: { type: "string" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_task",
      description: "Read full task(s) by title keyword or 'latest'/'all open'. Returns title, description, status, priority, due, links.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          contact_name: { type: "string" },
          project_title: { type: "string" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_items",
      description: "List recent items of a type. Use for 'show my notes/tasks/projects/meetings/emails', 'what tasks are open', 'any meetings this week', 'recent emails in my inbox'.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["notes", "tasks", "projects", "meetings", "emails"] },
          contact_name: { type: "string" },
          project_title: { type: "string" },
          limit: { type: "number", description: "Max items to return. emails: default 50, max 200 — pass higher when the user wants more of their inbox." }
        },
        required: ["kind"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_kb",
      description: "Broad semantic search over notes, tasks, projects, documents, emails. Use for open-ended questions like 'who is due for promotion', 'what did X promise', 'anything about fish'. Searches CONTENT, not just titles.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          contact_name: { type: "string" },
          project_title: { type: "string" },
          top_k: { type: "number" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "summarize_file",
      description: "Generate and save a summary for an uploaded file, only when the user explicitly asks to summarize/describe it. Do NOT call on upload.",
      parameters: {
        type: "object",
        properties: { doc_query: { type: "string", description: "Filename or id" } },
        required: ["doc_query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "link_event",
      description: "Link a Titan calendar event (meeting) to a person and/or a project. The link is stored locally only — the event on Titan is never modified. Use when the user says 'link the meeting X to person/project Y'.",
      parameters: {
        type: "object",
        properties: {
          event_query: { type: "string", description: "Event title keyword or UID to find the calendar event" },
          contact_name: { type: "string", description: "Person's name to link the event to" },
          project_title: { type: "string", description: "Project title to link the event to" }
        },
        required: ["event_query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "link_document",
      description: "Link an uploaded document to a contact/project by filename or id",
      parameters: {
        type: "object",
        properties: {
          doc_query: { type: "string" },
          contact_name: { type: "string" },
          project_title: { type: "string" }
        },
        required: ["doc_query"]
      }
    }
  }
];
