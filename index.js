const StoryblokClient = require('storyblok-js-client')

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
    process.exit(0)
  },

  async syncFolders() {
    let sourceFolders = await Storyblok.get(`spaces/${sourceSpaceId}/stories`, {
      folder_only: 1,
      per_page: 1000,
      sort_by: 'slug:asc'
    })
    let syncedFolders = {}

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

    for (var i = 0; i < roles.data.space_roles.length; i++) {
      let space_role = roles.data.space_roles[i]
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
        return role.role == space_role.role
      })
      if (existingRole.length) {
        await Storyblok.put(`spaces/${targetSpaceId}/space_roles/${existingRole[0].id}`, {
          space_role: space_role
        })
      } else {
        await Storyblok.post(`spaces/${targetSpaceId}/space_roles`, {
          space_role: space_role
        })
      }
      console.log(`Role ${space_role.role} synced`)
    }
  },

  async syncComponents() {
    this.targetComponents = await Storyblok.get(`spaces/${targetSpaceId}/components`)
    this.sourceComponents = await Storyblok.get(`spaces/${sourceSpaceId}/components`)

    for (var i = 0; i < this.sourceComponents.data.components.length; i++) {
      let component = this.sourceComponents.data.components[i]

      delete component.id
      delete component.created_at

      // Create new component on target space
      try {
        await Storyblok.post(`spaces/${targetSpaceId}/components`, {
          component: component
        })
        console.log(`Component ${component.name} synced`)
      } catch(e) {
        if (e.response.status == 422) {
          await Storyblok.put(`spaces/${targetSpaceId}/components/${this.getTargetComponentId(component.name)}`, {
            component: component
          })
          console.log(`Component ${component.name} synced`)
        } else {
          console.log(`Component ${component.name} sync failed`)
        }
      }
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
