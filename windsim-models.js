(function () {
  'use strict';

  var D = window.WindSimData;
  var T = window.WindSimTextures;

  function objectMaterial(def, extra) {
    var options = extra || {};
    var profile = {
      cannonball: { roughness: 0.34, metalness: 0.72 },
      crate: { roughness: 0.92, metalness: 0.02 },
      brick: { roughness: 0.98, metalness: 0.01 },
      frisbee: { roughness: 0.38, metalness: 0.04 },
      paper: { roughness: 0.94, metalness: 0.0 },
      leaf: { roughness: 0.96, metalness: 0.0 },
      feather: { roughness: 0.98, metalness: 0.0 },
      umbrella: { roughness: 0.74, metalness: 0.02 },
      shuttlecock: { roughness: 0.88, metalness: 0.0 }
    }[def.texture || def.label.toLowerCase()] || {};
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: T.getObjectTexture(def.texture || def.label.toLowerCase(), def.col),
      roughness: options.roughness != null ? options.roughness : (profile.roughness != null ? profile.roughness : 0.7),
      metalness: options.metalness != null ? options.metalness : (profile.metalness != null ? profile.metalness : 0.08),
      transparent: !!options.transparent,
      alphaTest: options.alphaTest != null ? options.alphaTest : 0,
      side: options.side != null ? options.side : THREE.FrontSide
    });
  }

  function bendPlane(geometry, amount) {
    var pos = geometry.attributes.position;
    for (var i = 0; i < pos.count; i += 1) {
      var x = pos.getX(i);
      var y = pos.getY(i);
      pos.setZ(i, Math.sin(x * Math.PI) * amount + Math.cos(y * Math.PI * 0.5) * amount * 0.25);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildObjectVisual(def) {
    var root = new THREE.Group();
    var mesh = null;

    switch (def.shape) {
      case 'sphere':
      case 'ellipsoid':
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 40), objectMaterial(def));
        break;
      case 'paperball':
        mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), objectMaterial(def, { roughness: 0.9 }));
        break;
      case 'disc':
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 1), objectMaterial(def, { roughness: 0.42 }));
        break;
      case 'box':
      case 'brick':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), objectMaterial(def, { roughness: 0.85 }));
        break;
      case 'leaf':
      case 'feather':
        mesh = new THREE.Mesh(
          bendPlane(new THREE.PlaneGeometry(1, 1, 10, 16), def.shape === 'leaf' ? 0.08 : 0.05),
          objectMaterial(def, { transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.92 })
        );
        break;
      case 'umbrella': {
        var canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 30, 18, 0, D.TAU, 0, Math.PI * 0.58),
          objectMaterial(def, { side: THREE.DoubleSide, roughness: 0.76 })
        );
        canopy.position.y = 0.18;
        canopy.scale.y = 0.7;
        var shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 1.28, 12),
          new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.82 })
        );
        shaft.position.y = -0.30;
        var hook = new THREE.Mesh(
          new THREE.TorusGeometry(0.12, 0.022, 8, 24, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.84 })
        );
        hook.rotation.z = Math.PI * 0.5;
        hook.position.set(0, -0.92, 0.08);
        root.add(canopy, shaft, hook);
        break;
      }
      case 'shuttlecock': {
        var cork = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 20, 20),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.76 })
        );
        cork.scale.y = 0.8;
        cork.position.y = -0.28;
        var skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.5, 0.94, 18, 1, true),
          objectMaterial(def, { side: THREE.DoubleSide, roughness: 0.88 })
        );
        skirt.position.y = 0.12;
        root.add(skirt, cork);
        break;
      }
      case 'gltf':
        // Display a temporary box until the model loads
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x444444, wireframe: true }));
        if (THREE.GLTFLoader) {
          new THREE.GLTFLoader().load('./assets/' + def.modelFile, function(gltf) {
            var model = gltf.scene;
            
            // Re-center and extract dimensions
            var box = new THREE.Box3().setFromObject(model);
            var size = new THREE.Vector3();
            var center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            
            // Normalize scale so the largest dimension is 1.0 (to match our other unit-scale base geometries)
            var maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              model.scale.setScalar(1.0 / maxDim);
              model.position.sub(center.clone().multiplyScalar(1.0 / maxDim)); // offset to center
            }
            
            // Update physical parameters dynamically (Phase 4 integration)
            def.dims = [size.x, size.y, size.z];
            def.aero.chord = size.z;
            def.area = size.x * size.y; // approximate frontal area down Z
            def.r = Math.max(size.x, size.z) * 0.5;

            model.traverse(function(child) {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Preserve GLTF PBR materials but ensure they update with envMap
                if (child.material) {
                  child.material.envMapIntensity = 1.2;
                  child.material.needsUpdate = true;
                }
              }
            });
            
            root.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            root.add(model);
            mesh = model; // so the scaling logic below applies to the group
          });
        }
        break;
      default:
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), objectMaterial(def));
        break;
    }

    if (mesh) root.add(mesh);
    if (def.shape === 'leaf' || def.shape === 'feather') root.scale.set(def.dims[0], def.dims[1], 1);
    else root.scale.set(def.dims[0], def.dims[1], def.dims[2]);

    root.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return root;
  }

  function disposeObjectVisual(node) {
    node.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  window.WindSimModels = {
    buildObjectVisual: buildObjectVisual,
    disposeObjectVisual: disposeObjectVisual
  };
}());
