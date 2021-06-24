import Color from "../Core/Color.js";
import combine from "../Core/combine.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import DeveloperError from "../Core/DeveloperError.js";
import CesiumMath from "../Core/Math.js";
import Pass from "../Renderer/Pass.js";
import Cesium3DTileBatchTable from "./Cesium3DTileBatchTable.js";
import Cesium3DTileFeature from "./Cesium3DTileFeature.js";
import Cesium3DTileRefine from "./Cesium3DTileRefine.js";
import PointCloud from "./PointCloud.js";
import PointCloudShading from "./PointCloudShading.js";
import SceneMode from "./SceneMode.js";
import Model2 from "./Model2.js";
import PointCloudLoader from "./PointCloudLoader.js";
/**
 * Represents the contents of a
 * {@link https://github.com/CesiumGS/3d-tiles/tree/master/specification/TileFormats/PointCloud|Point Cloud}
 * tile in a {@link https://github.com/CesiumGS/3d-tiles/tree/master/specification|3D Tiles} tileset.
 * <p>
 * Implements the {@link Cesium3DTileContent} interface.
 * </p>
 *
 * @alias PointCloud3DTileContent2
 * @constructor
 *
 * @private
 */
function PointCloud3DTileContent2(
  tileset,
  tile,
  resource,
  arrayBuffer,
  byteOffset
) {
  this._tileset = tileset;
  this._tile = tile;
  this._resource = resource;
  this._pickId = undefined; // Only defined when batchTable is undefined
  this._batchTable = undefined; // Used when feature table contains BATCH_ID semantic
  this._styleDirty = false;
  this._features = undefined;
  this.featurePropertiesDirty = false;
  this._groupMetadata = undefined;

  this._pointCloud = new PointCloud({
    arrayBuffer: arrayBuffer,
    byteOffset: byteOffset,
    cull: false,
    opaquePass: Pass.CESIUM_3D_TILE,
    vertexShaderLoaded: getVertexShaderLoaded(this),
    fragmentShaderLoaded: getFragmentShaderLoaded(this),
    uniformMapLoaded: getUniformMapLoaded(this),
    batchTableLoaded: getBatchTableLoaded(this),
    pickIdLoaded: getPickIdLoaded(this),
  });

  this._loader = new PointCloudLoader({
    pointCloud: this._pointCloud,
  });

  this._model = undefined;
}

Object.defineProperties(PointCloud3DTileContent2.prototype, {
  featuresLength: {
    get: function () {
      if (defined(this._batchTable)) {
        return this._batchTable.featuresLength;
      }
      return 0;
    },
  },

  pointsLength: {
    get: function () {
      return this._pointCloud.pointsLength;
    },
  },

  trianglesLength: {
    get: function () {
      return 0;
    },
  },

  geometryByteLength: {
    get: function () {
      return this._pointCloud.geometryByteLength;
    },
  },

  texturesByteLength: {
    get: function () {
      return 0;
    },
  },

  batchTableByteLength: {
    get: function () {
      if (defined(this._batchTable)) {
        return this._batchTable.memorySizeInBytes;
      }
      return 0;
    },
  },

  innerContents: {
    get: function () {
      return undefined;
    },
  },

  readyPromise: {
    get: function () {
      return this._pointCloud.readyPromise;
    },
  },

  tileset: {
    get: function () {
      return this._tileset;
    },
  },

  tile: {
    get: function () {
      return this._tile;
    },
  },

  url: {
    get: function () {
      return this._resource.getUrlComponent(true);
    },
  },

  batchTable: {
    get: function () {
      return this._batchTable;
    },
  },

  groupMetadata: {
    get: function () {
      return this._groupMetadata;
    },
    set: function (value) {
      this._groupMetadata = value;
    },
  },
});

function getVertexShaderLoaded(content) {
  return function (vs) {
    if (defined(content._batchTable)) {
      return content._batchTable.getVertexShaderCallback(
        false,
        "a_batchId",
        undefined
      )(vs);
    }
    return vs;
  };
}

function getFragmentShaderLoaded(content) {
  return function (fs) {
    if (defined(content._batchTable)) {
      return content._batchTable.getFragmentShaderCallback(
        false,
        undefined,
        false
      )(fs);
    }
    return "uniform vec4 czm_pickColor;\n" + fs;
  };
}

function getUniformMapLoaded(content) {
  return function (uniformMap) {
    if (defined(content._batchTable)) {
      return content._batchTable.getUniformMapCallback()(uniformMap);
    }
    return combine(uniformMap, {
      czm_pickColor: function () {
        return content._pickId.color;
      },
    });
  };
}

function getBatchTableLoaded(content) {
  return function (batchLength, batchTableJson, batchTableBinary) {
    content._batchTable = new Cesium3DTileBatchTable(
      content,
      batchLength,
      batchTableJson,
      batchTableBinary
    );
  };
}

function getPickIdLoaded(content) {
  return function () {
    return defined(content._batchTable)
      ? content._batchTable.getPickId()
      : "czm_pickColor";
  };
}

function getGeometricError(content) {
  var pointCloudShading = content._tileset.pointCloudShading;
  var sphereVolume = content._tile.contentBoundingVolume.boundingSphere.volume();
  var baseResolutionApproximation = CesiumMath.cbrt(
    sphereVolume / content.pointsLength
  );

  var geometricError = content._tile.geometricError;
  if (geometricError === 0) {
    if (
      defined(pointCloudShading) &&
      defined(pointCloudShading.baseResolution)
    ) {
      geometricError = pointCloudShading.baseResolution;
    } else {
      geometricError = baseResolutionApproximation;
    }
  }
  return geometricError;
}

function createFeatures(content) {
  var featuresLength = content.featuresLength;
  if (!defined(content._features) && featuresLength > 0) {
    var features = new Array(featuresLength);
    for (var i = 0; i < featuresLength; ++i) {
      features[i] = new Cesium3DTileFeature(content, i);
    }
    content._features = features;
  }
}

PointCloud3DTileContent2.prototype.hasProperty = function (batchId, name) {
  if (defined(this._batchTable)) {
    return this._batchTable.hasProperty(batchId, name);
  }
  return false;
};

/**
 * Part of the {@link Cesium3DTileContent} interface.
 *
 * In this context a feature refers to a group of points that share the same BATCH_ID.
 * For example all the points that represent a door in a house point cloud would be a feature.
 *
 * Features are backed by a batch table and can be colored, shown/hidden, picked, etc like features
 * in b3dm and i3dm.
 *
 * When the BATCH_ID semantic is omitted and the point cloud stores per-point properties, they
 * are not accessible by getFeature. They are only used for dynamic styling.
 */
PointCloud3DTileContent2.prototype.getFeature = function (batchId) {
  if (!defined(this._batchTable)) {
    return undefined;
  }
  var featuresLength = this.featuresLength;
  //>>includeStart('debug', pragmas.debug);
  if (!defined(batchId) || batchId < 0 || batchId >= featuresLength) {
    throw new DeveloperError(
      "batchId is required and between zero and featuresLength - 1 (" +
        (featuresLength - 1) +
        ")."
    );
  }
  //>>includeEnd('debug');
  createFeatures(this);
  return this._features[batchId];
};

PointCloud3DTileContent2.prototype.applyDebugSettings = function (
  enabled,
  color
) {
  this._pointCloud.color = enabled ? color : Color.WHITE;
};

PointCloud3DTileContent2.prototype.applyStyle = function (style) {
  if (defined(this._batchTable)) {
    this._batchTable.applyStyle(style);
  } else {
    this._styleDirty = true;
  }
};

PointCloud3DTileContent2.prototype.update = function (tileset, frameState) {
  if (!defined(this._model)) {
    this._loader.process(frameState);
    this._model = new Model2({
      loader: this._loader,
    });
    return;
  }

  var model = this._model;
  var tile = this._tile;

  model.modelMatrix = tile.computedTransform;
  model.update(frameState);
};

PointCloud3DTileContent2.prototype.isDestroyed = function () {
  return false;
};

PointCloud3DTileContent2.prototype.destroy = function () {
  this._pickId = this._pickId && this._pickId.destroy();
  this._pointCloud = this._pointCloud && this._pointCloud.destroy();
  this._batchTable = this._batchTable && this._batchTable.destroy();
  this._model = this._model && this._model.destroy();
  return destroyObject(this);
};
export default PointCloud3DTileContent2;