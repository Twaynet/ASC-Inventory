Local Dev
    Postgres via Docker
    API on 3001
    Web on 3000
    Never test UI via Cloudflare

    If 'something spins': go to PS
        netstat -ano | findstr :3001
        tasklist /FI "PID eq <PID>"
        taskkill /PID <PID> /F
        netstat -ano | findstr :3001