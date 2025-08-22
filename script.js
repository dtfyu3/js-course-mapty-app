'use strict';


const l = [{
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
}, {
    name: 'Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
}, {
    name: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
},
{
    name: 'Alidade Smooth Dark',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
}, {
    name: 'Outdoors',
    url: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png',
}, {
    name: 'CARTO',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}, {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}, {
    name: '2GIS',
    url: 'http://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}',
}, {
    name: 'Google',
    url: 'http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
}, {
    name: 'Google Satellite',
    url: 'http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
}]

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const sidebar = document.querySelector('.sidebar');

class Workout {
    date = new Date();
    id = (Date.now().toString()).slice(-10);
    clicks = 0;
    path;
    calc = function () { };
    constructor(coords, distance, duration) {
        this.coords = coords;
        this.distance = distance;
        this.duration = duration;
    }
    _setDescription() {
        const date = new Intl.DateTimeFormat('en-US', {
            month: "long",
            day: "numeric",
        }).format(this.date);
        this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${date}`;
    }
    click() {
        this.clicks++;
    }
    update(fields) {
        Object.entries(fields).forEach(e => {
            if (this[e[0]]) {
                this[e[0]] = e[1];
            }
        });
        this.calc();
    }
}

class Running extends Workout {
    type = 'running';
    calc = this.calcPace;
    constructor(coords, distance, duration, cadence) {
        super(coords, distance, duration);
        this.cadence = cadence;
        this.calcPace();
        this._setDescription();
    }

    calcPace() {
        this.pace = this.duration / this.distance;
    }
    static fromData(data) {
        const { coords, distance, duration, cadence, id, clicks, date, path } = data;
        const running = new Running(coords, distance, duration, cadence);
        running.id = id;
        running.clicks = clicks;
        running.date = date;
        running._setDescription();
        running.path = path;
        return running;
    }
}

class Cycling extends Workout {
    type = 'cycling';
    calc = this.calcSpeed;
    constructor(coords, distance, duration, elevationGain) {
        super(coords, distance, duration);
        this.elevationGain = elevationGain;
        this.calcSpeed();
        this._setDescription();
    }

    calcSpeed() {
        this.speed = this.distance / (this.duration / 60);
        return this.speed;
    }
    static fromData(data) {
        const { coords, distance, duration, elevationGain, id, clicks, date, path } = data;
        const cycling = new Cycling(coords, distance, duration, elevationGain);
        cycling.id = id;
        cycling.clicks = clicks;
        cycling.date = date;
        cycling._setDescription();
        cycling.path = path;
        return cycling;
    }
}

class App {
    #workouts = [];
    #map;
    #mapZoom = 14;
    #maxZoom = 19;
    #mapEvent;
    #markers = new Map();
    #layersLinks = l;
    #layers = [];
    #layerControl;
    #isEditing = false;
    #editingWorkoutId = null;
    #isRouting = false;
    #routingWorkoutId = null;
    #path = [];
    #map_ref = this.#showForm.bind(this);
    #handle_workout_ref = this.#handleWorkoutClick.bind(this);
    #add_point_to_map_ref = this.#addPointToPath.bind(this);
    #remove_point_from_map_ref = this.#removePointFromMap.bind(this);
    constructor() {
        this.#getPosition();

        this.#getLocalStorage();

        form.addEventListener('submit', this.#handleSubmit.bind(this));
        inputType.addEventListener('change', this.#toggleElevationField);
        containerWorkouts.addEventListener('click', this.#handle_workout_ref);
        sidebar.addEventListener('click', this.#handleSidebarClick.bind(this));
        window.addEventListener('keydown', this.#handleEscapePress.bind(this));
    }
    #getPosition() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(this.#loadMap.bind(this), () => {
                alert(`I can't get your location without your permission. Loading map with default location.`);
                this.#loadMap({ coords: { latitude: 55.751244, longitude: 37.618423 } });
            });
        }

    }
    #loadMap(position) {
        const { longitude, latitude } = position.coords;
        const coords = [latitude, longitude];
        this.#layersLinks.forEach(link => {
            const layer = this.#buildLayer(link);
            // this.#layerControl.addBaseLayer(layer, link.name)
            this.#layers[link.name] = layer;
        });
        this.#map = L.map('map', { maxZoom: this.#maxZoom, layers: this.#layers['OpenStreetMap'] }).setView(coords, this.#mapZoom); //inittin default layer as OpenStreetMap
        this.#map.on('click', this.#map_ref);

        this.#layerControl = L.control.layers(this.#layers).addTo(this.#map);



        this.#workouts.forEach(w => {
            this.#renderWorkoutMarker(w);
            this.#renderWorkoutPath(w);
        });
    }
    #showForm(mapE) {
        this.#mapEvent = mapE;
        form.classList.remove('hidden');
        inputDistance.focus();

    }
    #hideForm() {
        inputDistance.value = inputDuration.value = inputElevation.value = inputCadence.value = '';
        form.style.display = 'none';
        form.classList.add('hidden');
        setTimeout(() => form.style.display = 'grid', 1000);
    }
    #handleEscapePress(e) {
        if (e.key === 'Escape' && !form.classList.contains('hidden')) {
            this.#hideForm();
        }
    }
    #toggleElevationField() {
        if (inputType.value === 'running') {
            inputElevation.closest('.form__row').classList.add('form__row--hidden');
            inputCadence.closest('.form__row').classList.remove('form__row--hidden');
        }
        else {
            inputElevation.closest('.form__row').classList.remove('form__row--hidden');
            inputCadence.closest('.form__row').classList.add('form__row--hidden');
        }
    }
    #handleSubmit(e) {
        e.preventDefault();

        if (this.#isEditing && this.#editingWorkoutId) {
            this.#editWorkout();
        }
        else this.#newWorkout();
    }
    #validInputs = (...inputs) =>
        inputs.every(val => Number.isFinite(val));

    #positives = (...inputs) => inputs.every(inp => inp > 0)

    #checkInputs(type, ...inputs) {
        if (type === 'running') {
            const [duration, distance, cadence] = inputs;
            return (this.#validInputs(duration, distance, cadence) && this.#positives(distance, duration, cadence));
        }
        else {
            const [duration, distance, elevation] = inputs;
            return (this.#validInputs(duration, distance, elevation) && this.#positives(distance, duration));
        }
    }
    #newWorkout() {
        const type = inputType.value;
        const distance = +inputDistance.value;
        const duration = +inputDuration.value;
        const { lat, lng } = this.#mapEvent.latlng;
        let workout;
        if (type === 'running') {
            const cadence = +inputCadence.value;
            if (!this.#checkInputs(type, distance, duration, cadence)) return alert('Positive only');
            workout = new Running([lat, lng], distance, duration, cadence);
        }
        if (type === 'cycling') {
            const elevation = +inputElevation.value;
            if (!this.#checkInputs(type, duration, distance, elevation)) return alert('Positive only');
            workout = new Cycling([lat, lng], distance, duration, elevation);
        }
        this.#workouts.push(workout);
        this.#renderWorkoutMarker(workout);
        this.#renderWorkout(workout);
        this.#hideForm();

        this.#setLocalStorage();

    }
    #editWorkout() {
        const workoutElement = containerWorkouts.querySelector(`.workout[data-id="${this.#editingWorkoutId}"]`);
        const workout = this.#workouts.find(w => w.id === this.#editingWorkoutId);
        const type = inputType.value;
        const distance = +inputDistance.value;
        const duration = +inputDuration.value;
        const coords = workout.coords;
        const id = workout.id;
        const clicks = workout.clicks;
        const date = workout.date;
        let cadence;
        let elevation;
        if (type === 'running') {
            cadence = +inputCadence.value;
            if (!this.#checkInputs(type, distance, duration, cadence)) return alert('Positive only');
        }
        else {
            elevation = +inputElevation.value;
            if (!this.#checkInputs(type, duration, distance, elevation)) return alert('Positive only');
        }
        if (type === workout.type) { //same type
            workout.update({ distance: distance, duration: duration, cadence: cadence, elevationGain: elevation });
            workoutElement.innerHTML = '';
            workoutElement.innerHTML = this.#createWorkoutElement(workout, false);
        }
        else {                                   //other type
            let data;
            if (type === 'running') data = { coords, distance, duration, cadence, id, clicks, date };

            else data = { coords, distance, duration, elevationGain: elevation, id, clicks, date };

            const newWorkout = type === 'running' ? Running.fromData(data) : Cycling.fromData(data);

            this.#workouts[this.#workouts.findIndex(w => w.id === this.#editingWorkoutId)] = newWorkout;

            workoutElement.innerHTML = '';
            workoutElement.classList.value = '';
            workoutElement.classList.add('workout', `workout--${type}`);
            workoutElement.innerHTML = this.#createWorkoutElement(newWorkout, false);
            this.#editWorkoutMarker(newWorkout);

            this.#isEditing = false;
            this.#editingWorkoutId = null;
        }
        this.#hideForm();

        this.#setLocalStorage();
    }
    #renderWorkoutMarker(workout) {
        const icon = workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️';
        const marker = L.marker(workout.coords).addTo(this.#map)
            .bindPopup(L.popup({
                maxWidth: 250,
                minWidth: 100,
                autoClose: false,
                closeOnClick: false,
                className: `${workout.type}-popup`,
            }))
            .setPopupContent(`${icon} ${workout.description}`)
            .openPopup();
        this.#markers.set(workout.id, { marker: marker, start: '', finish: '' });
    }
    #renderWorkoutPath(w) {
        if (!w.path) return;
        const startIcon = this.#createIcon('icons/start.png');
        const finishIcon = this.#createIcon('icons/finish.png');

        this.#createPathMarkers(w, w.path, { startIcon, finishIcon });

    }
    #createPathMarkers(w, coords, icons, addToMap = true) {
        const path = this.#createPath(coords, w.id);
        path.addTo(this.#map);
        const center = path.getBounds().getCenter();
        const { startIcon, finishIcon } = icons;
        const startMarker = L.marker(coords[0], { icon: startIcon });
        const finishMarker = L.marker(coords[coords.length - 1], { icon: finishIcon });
        if (addToMap) {
            startMarker.addTo(this.#map);
            finishMarker.addTo(this.#map);
        }
        const oldMarker = this.#markers.get(w.id);
        oldMarker.start = startMarker;
        oldMarker.finish = finishMarker;
        oldMarker.marker._latlng = center;
        this.#markers.set(w.id, oldMarker);
        return path;
    }
    #editWorkoutMarker(workout) {
        const marker = this.#markers.get(workout.id).marker;
        const icon = workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️';
        marker.setPopupContent(`${icon} ${workout.description}`);
        marker._popup._container.classList = '';
        marker._popup._container.classList.add('leaflet-popup', `${workout.type}-popup`, 'leaflet-zoom-animated');
    }
    #renderWorkout(workout) {
        const html = this.#createWorkoutElement(workout);
        form.insertAdjacentHTML('afterend', html);
        if (!document.querySelector('.fit')) {
            containerWorkouts.insertAdjacentHTML('afterend', '<div class="list-buttons"><button class="hide-all">Hide all workouts</button><button class="fit">Fit all markers</button></div>')
        }
    }
    #createWorkoutElement(workout, liNeeded = true) {
        let typeIcon, icon;
        let paceOrSpeed = {};
        let cadenceOrGain = {};
        const header = liNeeded ? `<li class="workout workout--${workout.type}" data-id="${workout.id}">` : '';
        switch (workout.type) {
            case 'running':
                typeIcon = '🏃‍♂️';
                icon = '🦶🏼';
                paceOrSpeed.value = workout.pace.toFixed(1);
                paceOrSpeed.unit = 'min/km'
                cadenceOrGain.value = workout.cadence;
                cadenceOrGain.unit = 'spm';
                break;
            case 'cycling':
                typeIcon = '🚴‍♀️';
                icon = '🗻';
                paceOrSpeed.value = workout.speed.toFixed(1);
                paceOrSpeed.unit = 'km/h'
                cadenceOrGain.value = workout.elevationGain;
                cadenceOrGain.unit = 'm'
                break;
        }
        let html = `${header}
         <button class="workout__view-btn" title="Hide on map"><i class="fa-regular fa-eye fa-xs"></i></button>
         <button class="workout__view-btn hidden" title="View on map"><i class="fa-regular fa-eye-slash fa-xs"></i></button>
         <button class="workout__close-btn" title="Delete workout">&times;</button>
         <button class="workout__edit-btn" title="Edit workout"><i class="fa-solid fa-pencil fa-xs"></i></button>
         <button class="workout__route-btn" title="Record a path"><i class="fa-solid fa-route fa-xs"></i></button>
          <h2 class="workout__title">${workout.description}</h2>
          <div class="workout__details">
            <span class="workout__icon">${typeIcon}</span>
            <span class="workout__value">${workout.distance}</span>
            <span class="workout__unit">km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⏱</span>
            <span class="workout__value">${workout.duration}</span>
            <span class="workout__unit">min</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${paceOrSpeed.value}</span>
            <span class="workout__unit">${paceOrSpeed.unit}</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">${icon}</span>
            <span class="workout__value">${cadenceOrGain.value}</span>
            <span class="workout__unit">${cadenceOrGain.unit}</span>
          </div>
         <div class="workout__route-controls hidden">
            <button class="workout__route-confirm-btn">Confirm</button>
            <button class="workout__route-reset-btn">Reset</button>
         </div>`;
        liNeeded ? html += '</li>' : '';
        return html;
    }
    #handleWorkoutClick(e) {
        const el = e.target.closest('.workout');
        if (!el) return;
        const workout = this.#workouts.find(workout => workout.id === el.dataset['id']);
        if (e.target.closest('.workout__close-btn'))
            this.#deleteWorkout(el);
        else if (e.target.closest('.workout__edit-btn')) {
            this.#handleEditClick(el);
        }
        else if (e.target.closest('.workout__route-btn')) {
            const controls = el.querySelector('.workout__route-controls');
            controls.classList.toggle('hidden');
            this.#isRouting = !this.#isRouting;
            this.#routingWorkoutId = workout.id;
            this.#startPath(e);
        }

        else if (e.target.closest('.workout__route-confirm-btn')) { //confirm path
            this.#confirmAPath(e);
        }
        else if (e.target.closest('.workout__route-reset-btn')) this.#handleResetPathClick(e); //reset path
        else if (e.target.closest('.workout__view-btn')) { //hide/show workout
            this.#toggleMarkers(this.#markers.get(el.dataset['id']));
            this.#toggleWorkoutPath(workout);
        }
        else {
            const workout = this.#workouts.find(workout => workout.id === el.dataset['id']);
            this.#moveToPopUp(workout);
        }

    }
    #handleSidebarClick(e) {
        if (!e.target.closest('.list-buttons')) return;
        if (e.target.closest('.fit')) this.#fitAllMarkers(e);
        else if (e.target.closest('.hide-all')) {
            if (this.#isRouting) return;
            this.#toggleAllWorkouts();
        }
    }
    #handleEditClick(el) {
        if (this.#isRouting) return;
        this.#isEditing = true;
        const workout = this.#workouts.find(workout => workout.id === el.dataset['id']);
        this.#editingWorkoutId = workout.id;
        if (!workout) return;
        console.log(workout);
        if (form.classList.contains('hidden')) this.#showForm();
        else this.#hideForm();
        inputType.value = workout.type;
        inputType.dispatchEvent(new InputEvent('change', { bubbles: true }));
        inputDistance.value = workout.distance;
        inputDuration.value = workout.duration;
        if (inputType.value === 'running') {
            inputCadence.value = workout.cadence;
        }
        else {
            inputElevation.value = workout.elevationGain;
        }

    }
    #deleteWorkout(el) {
        if (this.#isRouting) return;
        if (!confirm('Are you sure want to delete this activity?')) return;
        const workoutIdx = this.#workouts.findIndex(workout => workout.id === el.dataset['id']);
        if (workoutIdx === -1) return;

        const marker = this.#markers.get(el.dataset['id']);
        el.remove();
        if (marker) {
            Object.values(marker).forEach(m => m!= '' ? this.#map.removeLayer(m) : '');
            this.#markers.delete(el.dataset['id']);
        }
        this.#deleteWorkoutPath(this.#workouts[workoutIdx]);
        this.#workouts.splice(workoutIdx, 1);
        this.#setLocalStorage();
        if (containerWorkouts.querySelectorAll('.workout').length === 0) {
            document.querySelector('.fit').remove();
        }
    }

    #moveToPopUp(workout) {
        if (this.#isRouting) return;
        this.#map.setView(workout.coords, this.#mapZoom, {
            animate: true,
            pan: {
                duration: 1,
            }
        });
    }

    #toggleMarkers(...inputs) {
        let markers;
        markers = [...(inputs.length === 0 ? this.#markers.values() : inputs)].map(m => [...(Object.values(m,))].filter(v => v != '')).flat();
        markers.forEach(m => {
            if (this.#map.hasLayer(m)) {
                this.#map.removeLayer(m)
            }
            else { this.#map.addLayer(m) }
        })
    }
    #deleteMarkers(...markers){
        if(markers.length === 0) return;
        markers = markers.map(m=>Object.values(m)).flat().filter(f=>f!== '');
        markers.forEach(m => {
            if (this.#map.hasLayer(m)) this.#map.removeLayer(m)
        })
    }
    #toggleWorkoutPath(...workouts) {
        if (workouts.length === 0) workouts = this.#workouts;
        workouts.forEach(workout => {
            const workoutElement = containerWorkouts.querySelector(`.workout[data-id="${workout.id}"]`);
            workoutElement.querySelectorAll('.workout__view-btn').forEach(b => b.classList.toggle('hidden'));
            if (workout.path) {
                const id = Object.values(this.#map._layers).find(l => l.options.id === workout.id);
                if (id._path) {
                    const cl = L.DomUtil.getClass(id._path);
                    cl.includes('hidden') ? L.DomUtil.removeClass(id._path, 'hidden') : L.DomUtil.addClass(id._path, 'hidden');
                }
            }
        })
    }
    #toggleAllWorkouts() {
        this.#toggleMarkers();
        this.#toggleWorkoutPath();
    }

    #hideAllWorkouts() {
        this.#workouts.forEach(workout => {
            const workoutElement = containerWorkouts.querySelector(`.workout[data-id="${workout.id}"]`);
            workoutElement.querySelectorAll('.workout__view-btn').forEach(b => b.classList.toggle('hidden'));
            if (workout.path) {
                const id = Object.values(this.#map._layers).find(l => l.options.id === workout.id);
                if (id._path) {
                    L.DomUtil.addClass(id._path, 'hidden');
                }
            }
        });

        hideAllMarkers.bind(this)();

        function hideAllMarkers() {
            const markers = [...this.#markers.values()].map(m => [...(Object.values(m))].filter(v => v != '')).flat();
            markers.forEach(m => {
                if (this.#map.hasLayer(m)) this.#map.removeLayer(m)
            })
        }
    }
    #startPath(e) {
        if (!this.#isRouting) {
            this.#handleResetPathClick(e);
            return;
        }
        if (!form.classList.contains('hidden')) this.#hideForm();
        const workout = this.#workouts.find(workout => workout.id === this.#routingWorkoutId);
        this.#hideAllWorkouts();
        this.#map.off('click', this.#map_ref);
        this.#map.on('click', this.#add_point_to_map_ref);
        this.#map.on('contextmenu',this.#remove_point_from_map_ref);
        document.querySelector('.leaflet-container').style.cursor = 'crosshair';

      
        this.#map.setView(workout.coords, 18, {
            animate: true,
            pan: {
                duration: 1,
            }
        });
    }
    #addPointToPath(mapE) {
        const { lat, lng } = mapE.latlng;
        const circle = L.circle([lat, lng]).addTo(this.#map);
        this.#path.push(circle);
    }
    #removePointFromMap(){
        if(!this.#isRouting || this.#path.length === 0 ) return;
        this.#map.removeLayer(this.#path.pop());
        
    }
    #confirmAPath(e) {
        const workout = this.#workouts.find(w => w.id === this.#routingWorkoutId);
        if (this.#path.length < 2) alert('Pick at least two points on the map!');
        const coords = this.#path.map(el => {
            const { lat, lng } = el._latlng;
            return [lat, lng];
        });
        const distance = this.#calculatePathDistance(coords);

        this.#deleteWorkoutPath(workout); //removing previous path
        this.#deleteMarkers(this.#markers.get(this.#routingWorkoutId)); //removing previous markers

        const startIcon = this.#createIcon('icons/start.png');
        const finishIcon = this.#createIcon('icons/finish.png');
        const path = this.#createPathMarkers(workout, coords, { startIcon, finishIcon }, false);
        const center = path.getBounds().getCenter();


        workout.distance = distance.toFixed(2);
        const workoutElement = containerWorkouts.querySelector(`.workout[data-id="${workout.id}"]`);


        workout.coords = center;
       
        workout.path = path._latlngs;
        this.#toggleWorkoutPath(workout); //hide path by default, because then toggleAllWorkouts() will be called
        this.#setLocalStorage();
        this.#handleResetPathClick(e);
        workoutElement.innerHTML = '';
        workoutElement.innerHTML = this.#createWorkoutElement(workout, false);
    }
    #deleteWorkoutPath(workout) {
        if (workout.path) {
            const id = Object.values(this.#map._layers).find(l => l.options.id === workout.id);
            if (id) {
                this.#map.removeLayer(id);
            }
            workout.path = null;
        }
    }
    #calculatePathDistance(coords) {
        function getDistance(origin, destination) {
            function toRadian(degree) {
                return degree * Math.PI / 180;
            }

            const lon1 = toRadian(origin[1]),
                lat1 = toRadian(origin[0]),
                lon2 = toRadian(destination[1]),
                lat2 = toRadian(destination[0]);
            const deltaLat = lat2 - lat1;
            const deltaLon = lon2 - lon1;
            const a = Math.pow(Math.sin(deltaLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLon / 2), 2);
            const c = 2 * Math.asin(Math.sqrt(a));
            const EARTH_RADIUS = 6371;
            return c * EARTH_RADIUS * 1000;

        }

        const distance = coords.reduce((acc, cur) => {
            if (!acc.from) {
                acc.from = cur;
                return acc;
            }
            else {
                acc.to = cur;
                acc.sum += getDistance(acc.from, acc.to);
                acc.from = acc.to;
                return acc;
            }
        }, { sum: 0, from: null, to: null });

        return distance.sum / 1000;
    }
    #createIcon(url, size = 40) {
        return new L.icon({
            iconUrl: url,
            iconSize: [size, size],
        });
    }
    #createPath(coords, id, weight = 2) {
        return new L.polyline(coords, {
            color: this.#getRandomColor(),
            weight: weight,
            smoothFactor: 1,
            dashArray: '10 10',
            id: id,
        })
    }
    #handleResetPathClick(e) {
        this.#path.forEach(point => {
            this.#map.removeLayer(point);
        })
        this.#path = [];
        this.#isRouting = false;
        this.#routingWorkoutId = null;
        document.querySelector('.leaflet-container').style.cursor = '';
        const el = e.target.closest('.workout');
        const controls = el.querySelector('.workout__route-controls');
        this.#toggleAllWorkouts();
        this.#isRouting ? controls.classList.remove('hidden') : controls.classList.add('hidden');
        this.#map.off('click', this.#add_point_to_map_ref);
        this.#map.off('contextmenu',this.#remove_point_from_map_ref);
        this.#map.on('click', this.#map_ref);

    }
    #setLocalStorage() {
        localStorage.setItem('workouts', JSON.stringify(this.#workouts));
    }
    #getLocalStorage() {
        const data = JSON.parse(localStorage.getItem('workouts'), (key, value) => key === 'date' ? new Date(value) : value);
        if (data) {
            data.forEach(entry => {
                if (entry.type === 'running') this.#workouts.push(Running.fromData(entry));
                else this.#workouts.push(Cycling.fromData(entry))
            });
            this.#workouts.forEach(w => {
                this.#renderWorkout(w);
            });
        }
    }
    reset() {
        localStorage.removeItem('workouts');
        location.reload();
    }

    #fitAllMarkers(e) {
        if (!e.target.classList.contains('fit') || this.#isRouting) return;
        const arr = [...this.#markers.values().map(m => m.marker)];
        const group = new L.featureGroup((arr));
        this.#map.fitBounds(group.getBounds());
    }
    #buildLayer(layer) {
        const options = {
            maxZoom: this.#maxZoom,
        };
        layer.subdomains ? options.subdomains = layer.subdomains : '';
        return L.tileLayer(`${layer.url}`, options);
    }
    #getRandomColor() {
        const rand = (min, max) => Math.round(Math.random() * (max - min + 1) + min);

        return `rgb(${rand(0, 255)},${rand(0, 255)},${rand(0, 255)})`

    }
}

const app = new App();
