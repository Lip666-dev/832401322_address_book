# 云端部署（可选加分项）

作业里「部署到公网服务器」最多 +15 分。应用是纯静态站点，部署只需要把文件拷上去 + 一个 Web 服务器。

本次部署目标：**华为云 / 阿里云 ECS**（上次作业那台 `192.144.235.99`），端口 **8081**（8080 已被上次的计算器占用）。

## 1. 一条命令部署（Linux / macOS / WSL）

```bash
# 在仓库根目录执行；把 user@host 换成你的服务器
bash deploy/deploy.sh root@192.144.235.99

# 或者指定端口/目录
bash deploy/deploy.sh root@192.144.235.99 8081 /var/www/address-book
```

脚本做四件事：`scp` 传文件 → 建目录与权限 → 装 Nginx 配置（如果服务器有 Nginx）→ `curl` 自检。

## 2. Windows 上部署

```powershell
pwsh -File deploy\deploy.ps1 -Target root@192.144.235.99 -Port 8081
```

需要本机有 `ssh` / `scp`（Windows 10+ 自带 OpenSSH 客户端）。

## 3. 如果服务器没有 Nginx（用 Python 顶一下）

```bash
ssh root@192.144.235.99
cd /var/www/address-book
nohup env PORT=8081 python3 serve.py > /var/log/address-book.log 2>&1 &
curl -I http://127.0.0.1:8081/
```

想开机自启就配一个 systemd 单元（见 `deploy/address-book.service`）。

## 4. 必须检查的两件事

1. **云服务器安全组**要放行 8081（入方向 TCP）。
2. 服务器本地防火墙：`firewall-cmd --add-port=8081/tcp --permanent && firewall-cmd --reload`
   或 `ufw allow 8081/tcp`。

## 5. 验收

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://192.144.235.99:8081/
# 期望 200

curl -s http://192.144.235.99:8081/ | grep -o '<title>[^<]*</title>'
# 期望 <title>通讯录 · Address Book</title>
```

浏览器打开 <http://192.144.235.99:8081/>，新建一个联系人、收藏它、导出一份 Excel，能下载就说明整条链路都通了。

## 6. 回滚

```bash
ssh root@192.144.235.99 'rm -rf /var/www/address-book && nginx -s reload'
```
