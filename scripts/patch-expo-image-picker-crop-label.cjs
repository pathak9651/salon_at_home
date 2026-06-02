const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-image-picker",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "imagepicker",
  "contracts",
  "CropImageContract.kt",
);

if (!fs.existsSync(target)) {
  console.warn("[patch-expo-image-picker] CropImageContract.kt not found; skipping crop label patch.");
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
const marker = "CropImageOptions().apply {\n";
const patch = 'CropImageOptions().apply {\n          activityTitle = "Save"\n          cropMenuCropButtonTitle = "Save"\n';

if (source.includes('cropMenuCropButtonTitle = "Save"')) {
  process.exit(0);
}

if (!source.includes(marker)) {
  console.warn("[patch-expo-image-picker] CropImageOptions marker not found; skipping crop label patch.");
  process.exit(0);
}

fs.writeFileSync(target, source.replace(marker, patch));
console.log("[patch-expo-image-picker] Crop label patched to Save.");
