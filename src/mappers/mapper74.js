import Mapper119 from "./mapper119.js";

// Mapper 74 is an MMC3 board with its own initial CHR/RAM bank layout.
class Mapper74 extends Mapper119 {
  static mapperName = "Mapper 74";

  loadROM() {
    super.loadROM();
    this.banks = Uint8Array.from([0, 2, 4, 5, 6, 7, 0, 1]);
    this.ramControl = 0x80;
    this.updateBanks();
  }

  updateBanks() {
    const last = this.nes.rom.romCount * 2 - 1;
    const p = this.prgAddressSelect;
    const prgBanks = [
      p ? last - 1 : this.banks[6],
      this.banks[7],
      p ? this.banks[6] : last - 1,
      last,
    ];
    for (let i = 0; i < prgBanks.length; i++) {
      this.load8kRomBank(prgBanks[i], 0x8000 + i * 0x2000);
    }

    const [a, b, c, d, e, f] = this.banks;
    const slots = [a & 0xfe, a | 1, b & 0xfe, b | 1, c, d, e, f];
    for (let i = 0; i < 8; i++) {
      const bank = slots[i ^ (this.chrAddressSelect ? 4 : 0)];
      const address = i * 0x400;
      if (bank === 8 || bank === 9) {
        this.load1kChrRamBank(bank - 8, address);
      } else {
        this.saveChrRamSlot(address);
        this.chrRamSlots[i] = -1;
        this.load1kVromBank(bank, address);
      }
    }
  }

  load(address) {
    if (address >= 0x6000 && address < 0x8000 && !(this.ramControl & 0x80)) {
      return this.nes.cpu.dataBus;
    }
    return super.load(address);
  }

  write(address, value) {
    if (address < 0x8000) {
      if (address >= 0x6000 && (this.ramControl & 0xc0) !== 0x80) return;
      return super.write(address, value);
    }

    switch (address & 0xe001) {
      case 0x8000:
        this.command = value & 7;
        this.prgAddressSelect = (value >> 6) & 1;
        this.chrAddressSelect = value >> 7;
        this.updateBanks();
        break;
      case 0x8001:
        this.banks[this.command] = this.command >= 6 ? value & 0x3f : value;
        this.updateBanks();
        break;
      case 0xa000: {
        const rom = this.nes.rom;
        this.nes.ppu.setMirroring(
          [
            rom.VERTICAL_MIRRORING,
            rom.HORIZONTAL_MIRRORING,
            rom.SINGLESCREEN_MIRRORING,
            rom.SINGLESCREEN_MIRRORING2,
          ][value & 3],
        );
        break;
      }
      case 0xa001:
        this.ramControl = value;
        break;
      case 0xc000:
        this.irqLatchValue = value;
        break;
      case 0xc001:
        this.reload = true;
        break;
      default:
        super.write(address, value);
    }
  }

  clockIrqCounter() {
    this.irqCounter =
      this.reload || !this.irqCounter
        ? this.irqLatchValue
        : this.irqCounter - 1;
    this.reload = false;
    if (!this.irqCounter && this.irqEnable) {
      this.nes.cpu.requestIrq(this.nes.cpu.IRQ_NORMAL);
    }
  }
}

export default Mapper74;
