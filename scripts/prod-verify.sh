set -e
PROD=https://yff-qrdnutwzl-kevinjmireles-projects.vercel.app

echo "== /admin/login headers =="
curl -s -I "$PROD/admin/login" | egrep -i "HTTP/|x-commit|x-nextjs|cache|content-type|location" | cat

echo "
== login API invalid password =="
curl -s -i -X POST "$PROD/api/admin/login" -H content-type: application/json --data {password:wrong} | egrep -i "HTTP/|x-login-handler|content-type|location" | cat

echo "
== login API valid password (expect JSON, no 307) =="
curl -s -i -X POST "$PROD/api/admin/login" -H content-type: application/json --data {password:admin123} | egrep -i "HTTP/|x-login-handler|set-cookie|content-type|location" | cat

