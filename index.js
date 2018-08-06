const StoryblokClient = require('storyblok-js-client')
const fs = require('fs')

const Storyblok = new StoryblokClient({
  oauthToken: process.env.STORYBLOK_OAUTH
})

const sourceSpaceId = process.env.SOURCE_SPACE
const targetSpaceId = process.env.TARGET_SPACE

const Sync = {
  targetComponents: [],
  sourceComponents: [],
  existingFolders: [],
  componentsCount: 0,
  componentsSynced: 0,

  async init() {
    await this.syncFolders()
    await this.syncRoles()
    await this.syncComponents()
  },

  async syncFolders() {
    let sourceFolders = await Storyblok.get(`spaces/${sourceSpaceId}/stories`, {
      folder_only: 1,
      per_page: 1000,
      sort_by: 'slug:asc'
    })
    let syncedFolders = {}

    fs.writeFileSync('./folders.json', JSON.stringify(sourceFolders.data, null, 2))

    for (var i = 0; i < sourceFolders.data.stories.length; i++) {
      let folder = sourceFolders.data.stories[i]
      let folderId = folder.id
      delete folder.id
      delete folder.created_at

      if (folder.parent_id) {
        // Parent child resolving
        if (!syncedFolders[folderId]) {
          let folderSlug = folder.full_slug.split('/')
          let parentFolderSlug = folderSlug.splice(0, folderSlug.length - 1).join('/')

          let existingFolders = await Storyblok.get(`spaces/${targetSpaceId}/stories`, {
              with_slug: parentFolderSlug
          })

          if (existingFolders.data.stories.length) {
            folder.parent_id = existingFolders.data.stories[0].id
          } else {
            folder.parent_id = 0
          }
        } else {
          folder.parent_id = syncedFolders[folderId]
        }
      }

      try {
        let newFolder = await Storyblok.post(`spaces/${targetSpaceId}/stories`, {
          story: folder
        })

        syncedFolders[folderId] = newFolder.data.story.id
        console.log(`Folder ${newFolder.data.story.name} created`)
      } catch(e) {
        console.log(`Folder ${folder.name} already exists`)
        // console.log(e.response.data)
      }
    }

    this.existingFolders = await Storyblok.get(`spaces/${targetSpaceId}/stories`, {
      folder_only: 1,
      per_page: 1000,
      sort_by: 'slug:asc'
    })
  },

  async syncRoles() {
    let roles = await Storyblok.get(`spaces/${sourceSpaceId}/space_roles`)
    let existingRoles = await Storyblok.get(`spaces/${targetSpaceId}/space_roles`)

    fs.writeFileSync('./roles.json', JSON.stringify(roles.data, null, 2))

    roles.data.space_roles.forEach((space_role) => {
      delete space_role.id
      delete space_role.created_at

      space_role.allowed_paths = []

      space_role.resolved_allowed_paths.forEach((path) => {
        let folders = this.existingFolders.data.stories.filter((story) => {
          return story.full_slug + '/' == path
        })

        if (folders.length) {
          space_role.allowed_paths.push(folders[0].id)
        }
      })

      let existingRole = existingRoles.data.space_roles.filter((role) => {
        return role.name == space_role.name
      })
      if (existingRole.length) {
        Storyblok.put(`spaces/${targetSpaceId}/space_roles/${existingRole[0].id}`, {
            space_role: space_role
          })
          .then(() => { console.log('Role synced') })
          .catch(this.errorCb)
      } else {
        Storyblok.post(`spaces/${targetSpaceId}/space_roles`, {
            space_role: space_role
          })
          .then(() => { console.log(`Role ${space_role.name} synced`) })
          .catch(this.errorCb)
      }
    })
  },

  async syncComponents() {
    this.targetComponents = await Storyblok.get(`spaces/${targetSpaceId}/components`)
    this.sourceComponents = await Storyblok.get(`spaces/${sourceSpaceId}/components`)

    fs.writeFileSync('./components.json', JSON.stringify(this.sourceComponents.data, null, 2))

    this.componentsCount = this.sourceComponents.data.components.length
    this.sourceComponents.data.components.forEach((component) => {
      delete component.id
      delete component.created_at

      // Create new component on target space
      Storyblok.post(`spaces/${targetSpaceId}/components`, {
          component: component
        })
        .then(this.syncedCb.bind(this))
        .catch((err) => {
          if (err.response.status == 422) {
            // Update existing component if already exists
            Storyblok.put(`spaces/${targetSpaceId}/components/${this.getTargetComponentId(component.name)}`, {
                component: component
              })
              .then(this.syncedCb.bind(this))
              .catch(this.errorCb)
          } else {
            this.errorCb(err)
          }
        })
    })
  },

  errorCb(err) {
    if (err.response && err.response.data) {
      console.error(err.response.data)
    } else {
      console.error(err)
    }
  },

  syncedCb(res) {
    this.componentsSynced = this.componentsSynced + 1

    console.log(`Component ${this.componentsSynced} of ${this.componentsCount} (${res.data.component.name}) synced`)

    if (this.componentsCount == this.componentsSynced) {
      console.log('All components synced')
      process.exit(0)
    }
  },

  getTargetComponentId(name) {
    let comps = this.targetComponents.data.components.filter((comp) => {
      return comp.name == name
    })

    return comps[0].id
  }
}

Sync.init()
