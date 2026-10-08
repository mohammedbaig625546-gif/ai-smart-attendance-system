/**
 * Geofence Service
 * Calculates real-world geographic distances using the Haversine formula.
 * Validates whether a student's coordinate is within the classroom boundary.
 */

const EARTH_RADIUS_METERS = 6371000; // Mean Earth radius in meters

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates geographic distance in meters between two lat/lon coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of location 1
 * @param {number} lon1 - Longitude of location 1
 * @param {number} lat2 - Latitude of location 2
 * @param {number} lon2 - Longitude of location 2
 * @returns {number} Distance in meters
 */
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Validates student location against session classroom geofence
 * 
 * @param {Object} studentLoc - { latitude, longitude, accuracy }
 * @param {Object} classroomGeofence - { latitude, longitude, radiusMeters }
 * @returns {Object} { isValid: boolean, distanceMeters: number, error?: string }
 */
function validateGeofence(studentLoc, classroomGeofence) {
  if (!studentLoc || studentLoc.latitude === undefined || studentLoc.longitude === undefined) {
    return {
      isValid: false,
      distanceMeters: null,
      error: "Location permission is required to submit feedback."
    };
  }

  const sLat = Number(studentLoc.latitude);
  const sLon = Number(studentLoc.longitude);
  const sAcc = studentLoc.accuracy !== undefined ? Number(studentLoc.accuracy) : null;

  const cLat = Number(classroomGeofence.latitude);
  const cLon = Number(classroomGeofence.longitude);
  const allowedRadius = Number(classroomGeofence.radiusMeters || 50);

  if (isNaN(sLat) || isNaN(sLon) || isNaN(cLat) || isNaN(cLon) || isNaN(allowedRadius)) {
    return {
      isValid: false,
      distanceMeters: null,
      error: "Invalid coordinates provided for geofence validation."
    };
  }

  // Calculate Haversine distance
  const distance = calculateDistanceInMeters(sLat, sLon, cLat, cLon);
  const roundedDistance = Math.round(distance * 10) / 10;

  // Check if distance is within allowed radius
  if (distance > allowedRadius) {
    return {
      isValid: false,
      distanceMeters: roundedDistance,
      allowedRadiusMeters: allowedRadius,
      accuracy: sAcc,
      error: "❌ You are outside the classroom. Feedback cannot be submitted from this location."
    };
  }

  return {
    isValid: true,
    distanceMeters: roundedDistance,
    allowedRadiusMeters: allowedRadius,
    accuracy: sAcc
  };
}

module.exports = {
  calculateDistanceInMeters,
  validateGeofence
};
