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
CLOUDFLARE_EMAIL = ""
CLOUDFLARE_API_KEY = ""
ZONE_ID = ""
ACCOUNT_ID = ""
EMAIL_DOMAIN = ""
```

```
wrangler deploy
```

```
# create a new email address
get https://yourname.workers.dev/email/create

{
    "success": true,
    "data": {
        "fetch_endpoint": "/email/v75pwnekqwisy3efdlk3tq@example.com",
        "address": "v75pwnekqwisy3efdlk3tq@example.com"
    }
}

# get email list
get https://yourname.workers.dev/email/{address}?parser=cursor

{
    "data": [
        {
            "id": 2,
            "subject": "Re: hi",
            "from": "xxxx",
            "to": "xxx",
            "html": null,
            "text": null,
            "createdAt": "2024-06-26 06:01:05",
            "parsed_code": "703589"
        } 
 
    ],
    "success": true
}

```

### Usage
```
"text": "发件人: \"Cursor\" <no-reply@cursor.sh&gt;;\r\n发送时间:&nbsp;2025年4月8日(星期二) 上午9:49\r\n收件人:&nbsp;\"yeo8\"<yeo8@example.com&gt;;\r\n\r\n主题:&nbsp;Sign in to Cursor\r\n\r\n\r\n\r\n Your one-time code is 340325. This code expires in 10 minutes. If you didn’t request to sign in to Cursor, you can safely ignore this email.\r\n \r\n\r\n\r\n\r\n\r\n\r\n\r\nSign in to Cursor\r\n\r\n \r\n\r\nYou requested to sign in to Cursor. Your one-time code is:\r\n\r\n \r\n\r\n340325\r\n\r\n \r\n\r\n\r\n\r\n\r\n \r\n\r\nThis code expires in 10 minutes.\r\n\r\n \r\n\r\nIf you didn’t request to sign in to Cursor, you can safely ignore this email. Someone else might have typed your email address by mistake.",
```