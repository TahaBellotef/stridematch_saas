const cmToInches = (cm: number) => cm / 2.54;

const roundHalf = (value: number) => Math.round(value * 2) / 2;

export const convertSizing = (lengthCm: number) => {
  // Assumptions:
  // - Adds ~1.5 cm toe allowance for EU Paris point sizing.
  // - Uses standard Brannock approximations for US sizes.
  const euSize = roundHalf((lengthCm + 1.5) * 1.5);
  const lengthInches = cmToInches(lengthCm);
  const usMen = roundHalf(lengthInches * 3 - 22);
  const usWomen = roundHalf(lengthInches * 3 - 21);

  return {
    euSize,
    usMen,
    usWomen,
  };
};
