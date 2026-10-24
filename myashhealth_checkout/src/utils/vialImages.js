import images from "../constants/images";

// Served from public/vial-images (copied from the vial-images folder).
// Product IDs and SKUs match vial-images/vial-image-mapping.csv.
const publicUrl = process.env.PUBLIC_URL || "";

const VIALS = {
  trt: `${publicUrl}/vial-images/vial-trt.png`,
  sermorelin: `${publicUrl}/vial-images/vial-sermorelin.png`,
  nad: `${publicUrl}/vial-images/vial-nad.png`,
  glutathione: `${publicUrl}/vial-images/vial-glutathione.png`,
  b12: `${publicUrl}/vial-images/vial-b12.png`,
};

const PRODUCT_ID_TO_VIAL = {
  "73": "sermorelin",
  "74": "sermorelin",
  "75": "sermorelin",
  "76": "sermorelin",
  "316": "sermorelin",
  "311": "nad",
  "312": "nad",
  "313": "nad",
  "310": "nad",
  "86": "glutathione",
  "87": "glutathione",
  "88": "glutathione",
  "89": "glutathione",
  "309": "glutathione",
  "97": "b12",
};

const SKU_TO_VIAL = {
  "SERM-30-1B": "sermorelin",
  "SERM-30-3B": "sermorelin",
  "SERM-6M": "sermorelin",
  "SERM-12M": "sermorelin",
  "SERM-1M-PEP": "sermorelin",
  "NAD-INJ-1M": "nad",
  "NAD-INJ-3M": "nad",
  "NAD-INJ-6M": "nad",
  "NAD-INJ-12M": "nad",
  "CRM-GLUTATH-1M": "glutathione",
  "GLUTA-3M": "glutathione",
  "GLUTA-6M": "glutathione",
  "GLUTA-12M": "glutathione",
  "GLUTATH-3M": "glutathione",
  "B12-1M": "b12",
};

const vialKeyFromText = (value) => {
  const text = String(value || "").toLowerCase();
  if (!text) return null;
  if (/sermorelin/.test(text)) return "sermorelin";
  if (/glutathione|\bgluta\b/.test(text)) return "glutathione";
  if (/\bb-?12\b|methylcobalamin/.test(text)) return "b12";
  if (/\bnad\b|nad\+/.test(text)) return "nad";
  if (/\btrt\b|testosterone|cypionate/.test(text)) return "trt";
  return null;
};

export const resolveVialKey = (product) => {
  if (!product) return null;

  const productId = String(product.product_id ?? product.id ?? "").trim();
  if (PRODUCT_ID_TO_VIAL[productId]) return PRODUCT_ID_TO_VIAL[productId];

  const sku = String(
    product.product_sku || product.sku || product.sku_name || ""
  )
    .trim()
    .toUpperCase();
  if (SKU_TO_VIAL[sku]) return SKU_TO_VIAL[sku];
  if (sku.startsWith("SERM")) return "sermorelin";
  if (sku.startsWith("NAD")) return "nad";
  if (sku.includes("GLUTA")) return "glutathione";
  if (sku.startsWith("B12")) return "b12";

  return (
    vialKeyFromText(product.product_name) ||
    vialKeyFromText(product.product_slug) ||
    vialKeyFromText(product.slug) ||
    vialKeyFromText(sku)
  );
};

const apiImageIsUsable = (src) =>
  typeof src === "string" &&
  /^https?:\/\//i.test(src) &&
  !/product_img\/https?:/i.test(src);

export const getProductImageSrc = (product) => {
  const key = resolveVialKey(product);
  if (key && VIALS[key]) return VIALS[key];

  const apiImage = product?.product_img?.[0]?.img_video;
  if (apiImageIsUsable(apiImage)) return apiImage;

  return images.bottel_img;
};

export const handleProductImageError = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = images.bottel_img;
};
