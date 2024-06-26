# email_worker_parser

# 
``` shell

wrangler d1 create <name>       Create D1 database

wrangler d1 execute --file ./sql/schema.sql
```

### change wrangler.toml
```
[[d1_databases]]
binding = "DB" # i.e. available in your Worker on env.DB
database_name = "cf_email_xxx"
database_id = "202c0469-b860-4993-ba42-xxxxx"

[vars]
forward_address = "xxx@email.com;yyy@email.com"
```

```
wrangler deploy
```

```
get https://yourname.workers.dev/email/{address}

{
    "results": [
        {
            "id": 2,
            "subject": "Re: hi",
            "from": "xxxx",
            "to": "xxx",
            "html": null,
            "text": null,
            "createdAt": "2024-06-26 06:01:05"
        } 
 
    ],
    "success": true,
    "meta": {
        "served_by": "v3-prod",
        "duration": 0.326,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 24576,
        "rows_read": 4,
        "rows_written": 0
    }
}

```