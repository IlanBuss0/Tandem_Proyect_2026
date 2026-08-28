import ActivityRevisionRepository from '../repositories/ActivityRevisionRepository.js';
import { validateActivityRevisionPayload } from '../modules/activity-performance/activity-revision.js';

export default class ActivityRevisionService {
  constructor(repository = new ActivityRevisionRepository()) {
    this.ActivityRevisionRepository = repository;
  }

  createAsync = async (payload) => {
    const validation = validateActivityRevisionPayload(payload);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    return await this.ActivityRevisionRepository.createAsync(payload);
  };

  getByIdAsync = async (id) => {
    if (!id || Number.isNaN(id)) {
      throw new Error('El id de la revision es invalido.');
    }

    return await this.ActivityRevisionRepository.getByIdAsync(id);
  };
}
