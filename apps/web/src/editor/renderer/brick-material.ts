import * as THREE from "three";

const FLAT_NORMAL_SOURCE = "vec3 normal = normalize( cross( fdx, fdy ) );";
const FLAT_NORMAL_SHADER = `vec3 faceNormal = normalize( cross( fdx, fdy ) );
	vec3 normal = faceNormal;`;

export const createBrickMaterial = (options: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.24,
    side: THREE.DoubleSide,
    ...options,
    flatShading: true
  });

  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(FLAT_NORMAL_SOURCE, FLAT_NORMAL_SHADER);
  };
  material.customProgramCacheKey = () => "brick-physical-flat-normal-v1";
  return material;
};
