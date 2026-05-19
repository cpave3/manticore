Use the tdd skill when implementing or changing features.

Do not run drizzle-kit migrations, just tell The user that they need to run them at the end of your output.

All db changes should happen via migration. Do not edit schema directly.

when implementing modules that store new records in db, such as mappings, upstreams, clients, the initial implementation should include full CRUD functionality in the API and UI
