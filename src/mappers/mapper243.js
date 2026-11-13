import Mapper0 from "./mapper0.js";

// Sachen SA-020A: serial-style register selection for PRG, CHR and mirroring.
class Mapper243 extends Mapper0 {
  static mapperName = "Sachen SA-020A";

  loadROM() {
    super.loadROM();
    this.index = 0;
    this.registers = new Uint8Array(8);
    this.load32kRomBank(0, 0x8000);
    this.load8kVromBank(0, 0x0000);
    this.setBoardMirroring(0);
  }

  setBoardMirroring(mode) {
    const rom = this.nes.rom;
    this.nes.ppu.setMirroring(
      [
        rom.SACHEN_L_MIRRORING,
        rom.HORIZONTAL_MIRRORING,
        rom.VERTICAL_MIRRORING,
        rom.SINGLESCREEN_MIRRORING2,
      ][mode],
    );
  }

  load(address) {
    if ((address & 0xc100) !== 0x4100) return super.load(address);
    const bits = address & 1 ? this.registers[this.index] : this.index;
    return (this.nes.cpu.dataBus & 0xf8) | bits;
  }

  write(address, value) {
    if ((address & 0xc100) !== 0x4100) return super.write(address, value);
    if (!(address & 1)) {
      this.index = value & 7;
      return;
    }

    const registers = this.registers;
    registers[this.index] = value & 7;
    switch (this.index) {
      case 2:
      case 4:
      case 6: {
        const chr =
          (registers[2] & 1) |
          ((registers[4] & 1) << 1) |
          ((registers[6] & 3) << 2);
        this.load8kVromBank(chr * 2, 0);
        break;
      }
      case 5:
        this.load32kRomBank(registers[5] & 3, 0x8000);
        break;
      case 7:
        this.setBoardMirroring(registers[7] >>> 1);
        break;
    }
  }
}

export default Mapper243;
