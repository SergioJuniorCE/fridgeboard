# Docker Compose + Cloudflare Tunnel + nightly dumps

PWA requires public HTTPS for install/push, but we run on a home server/VPS with no open ports desired and must survive DB + receipt-photo loss. We ship single Compose (app `standalone` + MariaDB + named volumes) behind Cloudflare Tunnel with nightly `mariadb-dump --single-transaction --quick` of DB + `uploads/`, 7-day retention with restore tests.
