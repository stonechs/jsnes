import Mapper0 from "./mapper0.js";

// JY830623C board: PPU A12 IRQ on mapper 91 and CPU M2 IRQ on submapper 1.
class Mapper91 extends Mapper0 {
  static mapperName = "JY830623C";

  loadROM() {
    super.loadROM();
    this.prg = new Uint8Array(2);
    this.chr = new Uint8Array(4);
    this.outer = null;
    this.enabled = false;
    this.pending = false;
    this.counter = 0;
    this.latch = 0;
    this.lastA12 = false;
    this.m2Dots = 0;
    this.sync();
  }

  sync() {
    const prgOuter = ((this.outer >>> 1) & 3) << 4;
    const chrOuter = (this.outer & 1) << 8;
    this.load8kRomBank(prgOuter + (this.prg[0] & 15), 0x8000);
    this.load8kRomBank(prgOuter + (this.prg[1] & 15), 0xa000);
    const fixed =
      this.outer === null ? this.nes.rom.romCount * 2 - 2 : prgOuter + 14;
    this.load8kRomBank(fixed, 0xc000);
    this.load8kRomBank(fixed + 1, 0xe000);
    for (let i = 0; i < 4; i++) {
      this.load2kVromBank(chrOuter + this.chr[i], i * 0x800);
    }
  }

  acknowledge() {
    this.enabled = false;
    if (this.pending && this.nes.cpu.irqType === this.nes.cpu.IRQ_NORMAL) {
      this.nes.cpu.irqRequested = false;
    }
    this.pending = false;
  }

  signal() {
    this.pending = true;
    this.nes.cpu.requestIrq(this.nes.cpu.IRQ_NORMAL);
  }

  write(address, value) {
    const subMapper = this.nes.rom.subMapper === 1;
    if (address >= 0x6000 && address < 0x7000) {
      const reg = address & (subMapper ? 7 : 3);
      if (reg < 4) {
        this.chr[reg] = value;
        this.sync();
      } else if (reg === 4 || reg === 5) {
        this.nes.ppu.setMirroring(
          reg === 4
            ? this.nes.rom.HORIZONTAL_MIRRORING
            : this.nes.rom.VERTICAL_MIRRORING,
        );
      } else if (reg === 6) {
        this.latch = (this.latch & 0xff00) | value;
      } else {
        this.latch = (this.latch & 0x00ff) | (value << 8);
      }
      return;
    }

    if (address >= 0x7000 && address < 0x8000) {
      const reg = address & (subMapper ? 7 : 3);
      if (reg < 2) {
        this.prg[reg] = value;
        this.sync();
      } else if (reg === (subMapper ? 6 : 2)) {
        this.acknowledge();
      } else if (reg === (subMapper ? 7 : 3)) {
        this.acknowledge();
        this.enabled = true;
        this.counter = subMapper ? this.latch : 0;
        this.m2Dots = 0;
      }
      return;
    }

    if (!subMapper && address >= 0x8000 && address < 0xa000) {
      this.outer = address & 7;
      this.sync();
      return;
    }
    super.write(address, value);
  }

  latchAccess(address) {
    if (this.nes.ppu.f_bgVisibility || this.nes.ppu.f_spVisibility) return;
    this.a12(!!(address & 0x1000));
  }

  a12(high) {
    if (this.enabled && !this.lastA12 && high && ++this.counter === 64) {
      this.signal();
    }
    this.lastA12 = high;
  }

  clockPpuDots(ppu, dots) {
    if (this.nes.rom.subMapper === 1) {
      if (this.enabled) {
        this.m2Dots += dots;
        const clocks = Math.floor(this.m2Dots / 12);
        this.m2Dots %= 12;
        if (clocks && (this.counter -= clocks * 5) <= 0) {
          this.signal();
          this.enabled = false;
        }
      }
      return;
    }

    const rendering = ppu.f_bgVisibility || ppu.f_spVisibility;
    for (let i = 0; i < dots; i++) {
      const x = (ppu.curX + i) % 341;
      const line = ppu.scanline + Math.floor((ppu.curX + i) / 341);
      let high = false;
      if (
        rendering &&
        line >= 20 &&
        line <= 260 &&
        x >= 1 &&
        x <= 336 &&
        ((x - 1) & 7) >= 4
      ) {
        if (x < 257 || x > 320) {
          high = !!ppu.regS;
        } else if (!ppu.f_spriteSize) {
          high = !!ppu.f_spPatternTable;
        } else {
          const scan = Math.min(240, line - 20);
          const slot = (x - 257) >>> 3;
          high =
            slot >= ppu.scanlineSpriteCount[scan] ||
            !!(ppu.scanlineSecondaryOAM[scan * 32 + slot * 4 + 1] & 1);
        }
      }
      this.a12(high);
    }
  }

  clockIrqCounter() {}
}

export default Mapper91;
