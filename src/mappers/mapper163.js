import Mapper0 from "./mapper0.js";

// Mapper 163 uses PPU A13 activity to select one of two 4KB CHR halves.
class Mapper163 extends Mapper0 {
  static mapperName = "Nanjing";

  loadROM() {
    super.loadROM();
    this.regs = new Uint8Array(4);
    this.chrHalf = 0;
    this.lastA13 = 0;
    this.lineHalf = new Int8Array(240).fill(-1);
    this.syncPrg();
  }

  syncPrg() {
    let high = this.regs[2] & 3;
    if (this.nes.rom.romCount === 64) high = Number(high !== 0);
    const bank = (high << 4) | (this.regs[0] & 15) | (this.regs[3] & 4 ? 0 : 3);
    this.load32kRomBank(bank, 0x8000);
  }

  load(address) {
    if (address >= 0x5000 && address < 0x6000) {
      return (address & 0xf300) === 0x5100 ? (~this.regs[1] & 4) : 0;
    }
    return super.load(address);
  }

  write(address, value) {
    if (address < 0x5000 || address >= 0x6000) {
      return super.write(address, value);
    }

    const reg = (address >> 8) & 15;
    if (reg > 3) return;
    if (reg < 3 && (this.regs[3] & 1)) {
      value = (value & 0xfc) | ((value & 1) << 1) | ((value & 2) >> 1);
    }
    if (reg === 1 && (address & 1)) {
      if ((this.regs[1] & 1) && !(value & 1)) this.regs[1] ^= 4;
      return;
    }

    this.nes.ppu.triggerRendering();
    this.regs[reg] = value;
    this.nes.ppu.validTileData = false;
    this.syncPrg();
  }

  observe(address) {
    const a13 = address & 0x2000;
    if (a13 && !this.lastA13) this.chrHalf = (address >> 9) & 1;
    this.lastA13 = a13;
  }

  patternAddress(address) {
    return this.regs[0] & 0x80 ? (address & 0x0fff) | (this.chrHalf << 12) : address;
  }

  bgHalf(scan, row) {
    this.chrHalf = (row >> 4) & 1;
    const half = this.regs[0] & 0x80 ? this.chrHalf : -1;
    if (scan >= 0 && scan < 240) this.lineHalf[scan] = half;
    return half;
  }

  spriteTile(index, scan) {
    const half = this.lineHalf[scan];
    return half >= 0 ? (index & 0xff) | (half << 8) : index;
  }
}

export default Mapper163;
