# Setup MikroTik CHR untuk RT/RW Billing

Topologi:
- **ether1** = WAN (internet)
- **ether2** = trunk berisi VLAN:
  - **VLAN 100** → PPPoE (pelanggan bulanan)
  - **VLAN 200** → Hotspot (voucher)
  - **VLAN 300** → LAN (server billing, admin)

Subnet dipakai (silakan sesuaikan):
- PPPoE : `10.100.0.0/16` (gateway `10.100.0.1`)
- Hotspot : `10.200.0.0/24` (gateway `10.200.0.1`)
- LAN : `192.168.30.0/24` (gateway `192.168.30.1`, **server billing = 192.168.30.102**)

> Di Proxmox: pastikan bridge yang terhubung ke **ether2** VM meneruskan tag VLAN 100/200/300 (VLAN-aware bridge / trunk). ether1 ke bridge WAN.

---

## 1. RESET (opsional, hati-hati — menghapus semua config)

Jalankan di terminal CHR. Router reboot & koneksi terputus:

```
/system reset-configuration no-defaults=yes skip-backup=yes
```

Setelah reboot, login (user `admin`, password kosong) lalu paste skrip di bagian 2.

---

## 2. SKRIP SETUP (paste seluruhnya ke terminal CHR)

Ganti yang ber-tanda **GANTI**: password user, dan IP server bila berbeda.

```rsc
# ====================================================================
#  RT/RW Billing — MikroTik CHR setup (2 ether + VLAN 100/200/300)
# ====================================================================
/system identity set name=RTRW-CHR

# ---------- WAN (ether1) : DHCP client ----------
# Bila WAN Anda PPPoE/statik, ganti bagian ini (lihat catatan di bawah).
/ip dhcp-client add interface=ether1 disabled=no add-default-route=yes use-peer-dns=yes comment="WAN"

# ---------- VLAN di ether2 ----------
/interface vlan
add name=vlan100-pppoe   interface=ether2 vlan-id=100 comment="PPPoE"
add name=vlan200-hotspot interface=ether2 vlan-id=200 comment="Hotspot"
add name=vlan300-lan     interface=ether2 vlan-id=300 comment="LAN"

# ---------- IP address per segmen ----------
/ip address
add address=192.168.30.1/24 interface=vlan300-lan   comment="LAN"
add address=10.200.0.1/24    interface=vlan200-hotspot comment="Hotspot"
# PPPoE: gateway diberikan lewat PPP profile (local-address), tak perlu IP di interface.

# ---------- IP Pool ----------
/ip pool
add name=pool-pppoe   ranges=10.100.0.2-10.100.255.254
add name=pool-hotspot ranges=10.200.0.10-10.200.0.254
add name=pool-lan     ranges=192.168.30.10-192.168.30.200

# ---------- DNS ----------
/ip dns set servers=8.8.8.8,1.1.1.1 allow-remote-requests=yes

# ---------- DHCP server: LAN ----------
/ip dhcp-server
add name=dhcp-lan interface=vlan300-lan address-pool=pool-lan lease-time=1d disabled=no
/ip dhcp-server network
add address=192.168.30.0/24 gateway=192.168.30.1 dns-server=192.168.30.1

# ---------- DHCP server: Hotspot ----------
/ip dhcp-server
add name=dhcp-hotspot interface=vlan200-hotspot address-pool=pool-hotspot lease-time=1h disabled=no
/ip dhcp-server network
add address=10.200.0.0/24 gateway=10.200.0.1 dns-server=10.200.0.1

# ---------- PPP profiles ----------
# Profil default utk pelanggan (aplikasi akan membuat profil per-paket sendiri).
/ppp profile
add name=pppoe-default local-address=10.100.0.1 remote-address=pool-pppoe \
    dns-server=8.8.8.8,1.1.1.1 only-one=yes comment="default PPPoE"
# Profil ISOLIR: pelanggan tetap bisa connect tapi diarahkan ke portal billing.
# address-list=isolir dipakai firewall utk redirect + blok internet.
add name=isolir local-address=10.100.0.1 remote-address=pool-pppoe \
    dns-server=192.168.30.102 rate-limit=512k/512k address-list=isolir comment="ISOLIR"

# ---------- PPPoE server (VLAN 100) ----------
/interface pppoe-server server
add service-name=RTRWNet interface=vlan100-pppoe default-profile=pppoe-default \
    one-session-per-host=yes disabled=no

# ---------- Hotspot (VLAN 200) ----------
/ip hotspot profile
add name=hsprof hotspot-address=10.200.0.1 login-by=http-pap,http-chap,mac-cookie \
    html-directory=hotspot
/ip hotspot
add name=hotspot1 interface=vlan200-hotspot address-pool=pool-hotspot profile=hsprof \
    addresses-per-mac=2
# Aplikasi membuat user & user-profile hotspot sendiri (voucher).

# ---------- NAT ----------
/ip firewall nat
add chain=srcnat out-interface=ether1 action=masquerade comment="masquerade WAN"
# Redirect pelanggan ISOLIR ke halaman portal billing (192.168.30.102:3000)
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=80 \
    action=dst-nat to-addresses=192.168.30.102 to-ports=3000 comment="isolir-http"
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=443 \
    action=dst-nat to-addresses=192.168.30.102 to-ports=3000 comment="isolir-https"

# ---------- Firewall filter ----------
/ip firewall filter
# --- INPUT (proteksi router) ---
add chain=input action=accept connection-state=established,related comment="in: est/rel"
add chain=input action=drop   connection-state=invalid comment="in: invalid"
add chain=input action=accept protocol=icmp comment="in: ping"
add chain=input src-address=192.168.30.0/24 protocol=tcp dst-port=8728,8729,8291 action=accept comment="API+Winbox dari LAN"
add chain=input in-interface=ether1 action=drop comment="in: drop dari WAN"
# --- FORWARD ---
add chain=forward action=accept connection-state=established,related comment="fwd: est/rel"
add chain=forward action=drop   connection-state=invalid comment="fwd: invalid"
# Isolir: hanya boleh ke server billing + DNS, sisanya diblok (sebelum accept umum)
add chain=forward src-address-list=isolir dst-address=192.168.30.102 action=accept comment="isolir->billing"
add chain=forward src-address-list=isolir protocol=udp dst-port=53 action=accept comment="isolir DNS udp"
add chain=forward src-address-list=isolir protocol=tcp dst-port=53 action=accept comment="isolir DNS tcp"
add chain=forward src-address-list=isolir action=drop comment="isolir blok internet"
add chain=forward action=accept comment="fwd: izinkan sisanya"

# CATATAN: JANGAN aktifkan fasttrack-connection — mematahkan limit kecepatan
# (simple queue) yang dipush aplikasi per paket.

# ---------- User & service utk aplikasi ----------
/user add name=billing password=GANTI-PASSWORD-KUAT group=full comment="RT/RW billing app"
/ip service set api     disabled=no port=8728
/ip service set winbox  disabled=no
/ip service set api-ssl disabled=yes
/ip service set telnet  disabled=yes
/ip service set ftp     disabled=yes
/ip service set www     disabled=yes
/ip service set www-ssl disabled=yes

# ---------- Selesai ----------
:put "Setup selesai. Set 'billing' password, lalu daftarkan router di aplikasi."
```

---

## 3. Kalau WAN bukan DHCP

**WAN statik** — ganti blok `dhcp-client` dengan:
```
/ip address add address=IP-PUBLIK/PREFIX interface=ether1
/ip route add gateway=IP-GATEWAY-ISP
/ip dns set servers=8.8.8.8,1.1.1.1
```

**WAN PPPoE (dari ISP)**:
```
/interface pppoe-client add name=wan-pppoe interface=ether1 \
  user=USER-ISP password=PASS-ISP add-default-route=yes use-peer-dns=yes disabled=no
```
Lalu di NAT ganti `out-interface=ether1` → `out-interface=wan-pppoe`, dan di filter `in-interface=ether1` → `in-interface=wan-pppoe`.

---

## 4. Daftarkan ke aplikasi RT/RW Billing

**Pengaturan → Router → Tambah Router:**
- Host/IP: `192.168.30.1`
- Port API: `8728`
- User API: `billing`
- Password: (yang Anda set)
- **Suspend/Isolir profile**: `isolir`  ← penting, ini yang membuat pelanggan
  telat bayar otomatis diarahkan ke portal, bukan diputus total.

Pastikan **server billing di `192.168.30.102`** (di LAN VLAN 300). Bila IP server
berbeda, ganti semua `192.168.30.102` di skrip ini.

## 5. Alur isolir otomatis

1. Jatuh tempo lewat → aplikasi (cron harian 00:05) suspend langganan.
2. Aplikasi set profil PPP secret pelanggan → `isolir`, sesi diputus.
3. Pelanggan dial ulang, dapat profil isolir → IP masuk address-list `isolir`.
4. Semua HTTP/HTTPS-nya diarahkan ke portal `192.168.30.102:3000` (halaman
   "Internet Ditangguhkan" + tombol bayar), internet lain diblok.
5. Setelah bayar & di-verifikasi → aplikasi aktifkan kembali (profil balik ke
   paket normal, sesi reconnect) → internet normal.
