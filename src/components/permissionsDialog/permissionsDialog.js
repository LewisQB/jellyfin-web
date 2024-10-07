import dom from '../../scripts/dom';
import dialogHelper from '../dialogHelper/dialogHelper';
import loading from '../loading/loading';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-select/emby-select';
import 'material-design-icons-iconfont';
import '../formdialog.scss';
import ServerConnections from '../ServerConnections';
import toast from '../toast/toast';

function getEditorHeaderHtml() {
    let html = '';

    html += '<div class="formDialogContent smoothScrollY" style="padding-top:2em;">';
    html += '<div class="dialogContentInner dialog-content-centered">';
    html += '<form style="margin:auto;">';

    html += '<div class="fldSelectPlaylist selectContainer">';
    html += '<select is="emby-select" id="selectViewPermissions" label="' + globalize.translate('SetVisibility') + '">';
    html += '<option value="private" selected>' + globalize.translate('MakePrivate') + '</option>';
    html += '<option value="public">' + globalize.translate('MakePublic') + '</option>';
    html += '</select>';
    html += '</div>';

    html += '<div class="fieldDescription">';
    html += globalize.translate('PlaylistPublicPrivateInfo');
    html += '</div>';

    return html;
}

function getEditorFooterHtml() {
    let html = '';
    html += '<input type="hidden" class="fldSelectedItemIds" />';

    html += '<br />';
    html += '<div class="formDialogFooter">';
    html += '<button is="emby-button" type="submit" class="raised btnSubmit block formDialogFooterItem button-submit">' + globalize.translate('Confirm') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';
    html += '</div>';

    return html;
}

function getUserPermssionHtml(user) {
    let html = '';
    html += '<div class="userPermissions ' + user.Name + '">';
    html += '<div class="userPermissionHeader">';
    html += user.Name;
    html += '</div>';
    html += '<label class="checkboxContainer fldViewPermissions">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkViewPermissions" />';
    html += '<span>' + globalize.translate('ViewPermissions') + '</span>';
    html += '</label>';

    html += '<label class="checkboxContainer fldEditPermissions">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkEditPermissions" />';
    html += '<span>' + globalize.translate('EditPermissions') + '</span>';
    html += '</label>';
    html += '</div>';
    return html;
}

function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

function onSubmit(e) {
    loading.show();

    const instance = this;
    const dlg = dom.parentWithClass(e.target, 'dialog');
    const options = instance.options;

    const apiClient = ServerConnections.getApiClient(options.serverId);

    const replaceAllMetadata = dlg.querySelector('#selectViewPermissions').value === 'all';

    const mode = dlg.querySelector('#selectViewPermissions').value === 'private' ? 'Default' : 'FullRefresh';
    const replaceAllImages = mode === 'FullRefresh' && dlg.querySelector('.chkReplaceImages').checked;
    const replaceTrickplayImages = mode === 'FullRefresh' && dlg.querySelector('.chkReplaceTrickplayImages').checked;

    options.itemIds.forEach(function (itemId) {
        apiClient.refreshItem(itemId, {
            Recursive: true,
            ImageRefreshMode: mode,
            MetadataRefreshMode: mode,
            ReplaceAllImages: replaceAllImages,
            RegenerateTrickplay: replaceTrickplayImages,
            ReplaceAllMetadata: replaceAllMetadata
        });
    });

    dialogHelper.close(dlg);

    toast(globalize.translate('PreferencesUpdated'));

    loading.hide();

    e.preventDefault();
    return false;
}

// Permissions Dialog for individual playlist permissions
class PermissionsDialog {
    constructor(options) {
        this.options = options;
        this.itemId = this.options.itemIds[0]; // itemIds is an array with one item
        this.serverId = this.options.serverId;
        this.apiClient = ServerConnections.getApiClient(this.serverId);
    }

    // Gets a list of all users then also gets their permissions for this playlist
    async getAllUsers() {
        // Create a list of all users
        const allUsers = await this.apiClient.getUsers();
        console.log(allUsers);
        if (allUsers != 'undefined') {
            if (allUsers.length === 0) {
                return 'undefined';
            } else {
                for (const user of allUsers) {
                    user.permissions = this.apiClient.getJSON('Playlists/' + this.itemId + '/Users/' + user.Id);
                }
            }
        }
        // const currentUser = this.apiClient.getCurrentUser();
        // Filter out the current user
        return allUsers; // .filter((user) => user.id !== currentUser.Id);
    }

    // Update the permissions for a specific user
    // Entering a null permissions object will remove the user's permissions
    updateUserPermissions(user, permissions) {
        user.modified = true;
        user.permissions = permissions;
    }

    // Sends the request to update the permissions for a specific user
    // Seperate from updateUserPermissions to allow for batch updating and performance improvements
    sendUpdateRequest(userId, permissions) {
        return this.apiClient.ajax({
            type: 'POST',
            url: 'Playlists/' + this.itemId + '/Users/' + userId,
            data: JSON.stringify(permissions),
            contentType: 'application/json'
        });
    }

    async show() {
        const dialogOptions = {
            removeOnClose: true,
            scrollY: false
        };

        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');

        let html = '';
        const title = globalize.translate('EditPermissions');

        html += '<div class="formDialogHeader">';
        html += `<button is="paper-icon-button-light" class="btnCancel autoSize" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += '<h3 class="formDialogHeaderTitle">';
        html += title;
        html += '</h3>';
        html += '</div>';
        html += getEditorHeaderHtml();

        const users = await this.getAllUsers();
        if (users != 'undefined') {
            for (const user of users ) {
                html += getUserPermssionHtml(user);
            }
        } else {
            html += '<div class="fieldDescription">';
            html += globalize.translate('NoUsersFound');
            html += '</div>';
        }
        html += getEditorFooterHtml();

        dlg.innerHTML = html;

        dlg.querySelector('form').addEventListener('submit', onSubmit.bind(this));

        // Adds listeners to the checkboxes to show/hide the edit permissions field
        dlg.querySelectorAll('.chkViewPermissions').forEach(function (chkViewPermissions) {
            chkViewPermissions.addEventListener('change', function () {
                const userHTML = dom.parentWithClass(chkViewPermissions, 'userPermissions');
                const hasViewPermissions = chkViewPermissions.checked;
                if (!hasViewPermissions) {
                    if (!userHTML.querySelector('.fldEditPermissions').classList.contains('hide')) {
                        userHTML.querySelector('.fldEditPermissions').classList.add('hide');
                    }
                } else if (userHTML.querySelector('.fldEditPermissions').classList.contains('hide')) {
                    userHTML.querySelector('.fldEditPermissions').classList.remove('hide');
                }
            });
        });

        // Adds listener to the public/private selection to show/hide the permissions fields
        dlg.querySelector('#selectViewPermissions').addEventListener('change', function () {
            if (this.value === 'private') {
                dlg.querySelectorAll('.userPermissions').forEach(function (userHTML) {
                    userHTML.querySelector('.fldViewPermissions').classList.remove('hide');
                    const hasViewPermissions = userHTML.querySelector('.chkViewPermissions').checked;
                    if (!hasViewPermissions) {
                        if (!userHTML.querySelector('.fldEditPermissions').classList.contains('hide')) {
                            userHTML.querySelector('.fldEditPermissions').classList.add('hide');
                        }
                    } else if (userHTML.querySelector('.fldEditPermissions').classList.contains('hide')) {
                        userHTML.querySelector('.fldEditPermissions').classList.remove('hide');
                    }
                });
            } else {
                dlg.querySelectorAll('.userPermissions').forEach(function (userHTML) {
                    userHTML.querySelector('.fldViewPermissions').classList.add('hide');
                    userHTML.querySelector('.fldEditPermissions').classList.remove('hide');
                });
            }
        });

        if (this.options.mode) {
            dlg.querySelector('#selectViewPermissions').value = this.options.mode;
        }

        dlg.querySelector('#selectViewPermissions').dispatchEvent(new CustomEvent('change'));

        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });

        if (layoutManager.tv) {
            centerFocus(dlg.querySelector('.formDialogContent'), false, true);
        }

        return new Promise(function (resolve) {
            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, false);
            }

            dlg.addEventListener('close', resolve);
            dialogHelper.open(dlg);
        });
    }
}

export default PermissionsDialog;
