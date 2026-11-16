---
name: guest-kernel-io-hang
description: "API outage 2026-11-16 was the API VM's own Debian kernel (6.1.0-55) hanging disk writes as Mongo started; VMs are pinned to 6.1.0-54 with apt holds that someone has to lift later"
metadata:
  node_type: memory
  type: project
  volatility: hot
  lastVerified: 2026-11-16
  originSessionId: d58370f4-e7d6-414f-bab4-68096026585e
  modified: 2026-11-16T22:15:54.824Z
---

On 2026-11-16 the API VM auto-installed Debian kernel `6.1.0-55-amd64` (6.1.192-1) through
unattended-upgrades at 06:01 and rebooted itself. Later that day it froze: `/health` returned 503
with Mongo timing out, SSH authenticated but no command ever ran. On every boot after that, guest
disk writes stalled within seconds of Docker starting `sf-db`.

**It looked like memory, then like the host, and was neither.** The hypervisor's free-memory figure
excludes cache and read ~108 MB while real available was ~700 MB. Raising the VM to 3 GB, hard
restarts and a full hypervisor reboot all changed nothing. The NVMe was healthy, other VMs on the
same thin pool wrote normally, and QEMU's QMP blockstats showed nothing in flight with the vCPU idle,
so the guest kernel never submitted the writes. Booting the previous kernel `6.1.0-54` fixed it
immediately. A second VM on the same template froze the same day and had been pinned to 6.1.0-54.

**What is in place:** each Debian VM on that hypervisor has `GRUB_DEFAULT` set to the 6.1.0-54
advanced entry and `apt-mark hold linux-image-amd64 linux-image-6.1.0-54-amd64`; the original is at
`/etc/default/grub.pre-kernel-pin`. One VM whose disk uses `iothread=1` ran 6.1.0-55 without freezing.

**How to apply:** if the API goes down with Mongo timing out and the VM unresponsive, check
`uname -r` before anything else. The holds block every kernel update, security ones included, so
lift them (unhold, restore the saved grub file, `update-grub`) once Debian ships a kernel past
6.1.0-55, and boot-test it with Mongo running before trusting it. Related: [[backend-deploy-and-prod-drift]].
